from functools import wraps
from datetime import datetime, timedelta
from django.core.cache import cache
from django.conf import settings
from rest_framework.response import Response
from rest_framework import status
import pytz


def get_kst_midnight():
    """다음 자정(KST) 시간 반환"""
    kst = pytz.timezone('Asia/Seoul')
    now = datetime.now(kst)
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight.isoformat()


def rate_limit_free(limit_per_day: int = 10, feature_name: str = 'default'):
    """
    무료 사용자 일일 제한 데코레이터

    Args:
        limit_per_day: 하루 최대 호출 횟수
        feature_name: 기능 이름 (에러 메시지 및 캐시 키용)
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(self, request, *args, **kwargs):
            # Rate Limit 비활성화 확인 (환경변수 또는 DB 설정)
            import os
            if os.environ.get('DISABLE_RATE_LIMIT', '').lower() == 'true':
                return view_func(self, request, *args, **kwargs)

            # DB 설정 확인
            try:
                from apps.core.models import SystemSetting
                if SystemSetting.get_bool('DISABLE_RATE_LIMIT', False):
                    return view_func(self, request, *args, **kwargs)
            except Exception:
                pass  # DB 접근 실패 시 무시

            # 사용자 식별: 로그인 사용자는 ID, 비로그인은 IP
            if request.user.is_authenticated:
                user_key = f"user_{request.user.id}"
            else:
                x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
                if x_forwarded_for:
                    ip = x_forwarded_for.split(',')[0].strip()
                else:
                    ip = request.META.get('REMOTE_ADDR', 'unknown')
                user_key = f"ip_{ip}"

            cache_key = f"rate_limit:{feature_name}:{user_key}"

            # 현재 사용량 확인
            current_count = cache.get(cache_key, 0)

            if current_count >= limit_per_day:
                reset_at = get_kst_midnight()
                return Response({
                    'success': False,
                    'error': 'DAILY_LIMIT_EXCEEDED',
                    'message': f'일일 {feature_name} 한도({limit_per_day}회)를 초과했습니다.',
                    'limit': limit_per_day,
                    'used': current_count,
                    'reset_at': reset_at,
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            # 카운트 증가 (24시간 후 만료)
            cache.set(cache_key, current_count + 1, settings.CACHE_TIMEOUTS.get('rate_limit', 86400))

            # 원래 뷰 실행
            response = view_func(self, request, *args, **kwargs)

            # 응답에 남은 횟수 헤더 추가
            if hasattr(response, 'data'):
                response['X-RateLimit-Limit'] = str(limit_per_day)
                response['X-RateLimit-Remaining'] = str(limit_per_day - current_count - 1)

            return response

        return wrapper
    return decorator


def premium_only(feature_name: str = ''):
    """유료 기능 제한 데코레이터"""
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(self, request, *args, **kwargs):
            # TODO: 실제 구현 시 사용자의 구독 상태 확인
            is_premium = getattr(request.user, 'is_premium', False) if request.user.is_authenticated else False

            if not is_premium:
                return Response({
                    'success': False,
                    'error': 'FEATURE_LOCKED',
                    'message': '이 기능은 유료 버전에서 사용할 수 있습니다.',
                    'feature': feature_name,
                }, status=status.HTTP_403_FORBIDDEN)

            return view_func(self, request, *args, **kwargs)
        return wrapper
    return decorator
