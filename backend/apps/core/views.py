from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser, AllowAny
from django.core.cache import cache
from .models import SystemSetting


class SystemSettingsView(APIView):
    """시스템 설정 관리 API"""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAdminUser()]

    def get(self, request):
        """현재 시스템 설정 조회 (공개)"""
        settings_data = {
            'rate_limit_disabled': SystemSetting.get_bool('DISABLE_RATE_LIMIT', False),
        }
        return Response({
            'success': True,
            'settings': settings_data,
        })

    def post(self, request):
        """시스템 설정 변경 (관리자 전용)"""
        key = request.data.get('key')
        value = request.data.get('value')

        if not key:
            return Response({
                'success': False,
                'message': 'key를 지정해주세요.',
            }, status=status.HTTP_400_BAD_REQUEST)

        # 허용된 설정 키만 변경 가능
        allowed_keys = ['DISABLE_RATE_LIMIT']
        if key not in allowed_keys:
            return Response({
                'success': False,
                'message': f'허용되지 않은 설정 키입니다. 허용: {allowed_keys}',
            }, status=status.HTTP_400_BAD_REQUEST)

        SystemSetting.set(key, str(value))

        return Response({
            'success': True,
            'message': f'{key} 설정이 {value}로 변경되었습니다.',
            'key': key,
            'value': value,
        })


class RateLimitToggleView(APIView):
    """Rate Limit 토글 API (관리자 전용)"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        """현재 Rate Limit 상태 조회"""
        disabled = SystemSetting.get_bool('DISABLE_RATE_LIMIT', False)
        return Response({
            'success': True,
            'rate_limit_enabled': not disabled,
            'rate_limit_disabled': disabled,
        })

    def post(self, request):
        """Rate Limit 토글"""
        current = SystemSetting.get_bool('DISABLE_RATE_LIMIT', False)
        new_value = not current
        SystemSetting.set('DISABLE_RATE_LIMIT', str(new_value).lower(), 'Rate Limit 비활성화 여부')

        return Response({
            'success': True,
            'rate_limit_enabled': not new_value,
            'rate_limit_disabled': new_value,
            'message': f'Rate Limit이 {"비활성화" if new_value else "활성화"}되었습니다.',
        })


class RateLimitResetView(APIView):
    """Rate Limit 초기화 API (관리자 전용)"""
    permission_classes = [IsAdminUser]

    def post(self, request):
        """
        Rate Limit 초기화

        Body:
        - user_key: 특정 사용자 초기화 (선택사항)
        - feature: 특정 기능만 초기화 (선택사항)
        - all: true면 모든 rate limit 초기화
        """
        user_key = request.data.get('user_key')
        feature = request.data.get('feature')
        clear_all = request.data.get('all', False)

        if clear_all:
            # 모든 캐시 삭제 (rate_limit 포함)
            cache.clear()
            return Response({
                'success': True,
                'message': '모든 캐시가 초기화되었습니다.',
            })

        if user_key and feature:
            cache_key = f"rate_limit:{feature}:{user_key}"
            cache.delete(cache_key)
            return Response({
                'success': True,
                'message': f'{user_key}의 {feature} rate limit이 초기화되었습니다.',
            })

        if user_key:
            # 해당 사용자의 모든 rate limit 초기화
            features = ['주소검색', '토지조회', '필지클릭', '토지분석', '매스스터디']
            deleted = 0
            for f in features:
                cache_key = f"rate_limit:{f}:{user_key}"
                if cache.delete(cache_key):
                    deleted += 1
            return Response({
                'success': True,
                'message': f'{user_key}의 rate limit {deleted}개가 초기화되었습니다.',
            })

        return Response({
            'success': False,
            'message': 'user_key 또는 all=true를 지정해주세요.',
        }, status=status.HTTP_400_BAD_REQUEST)

    def get(self, request):
        """현재 사용자의 Rate Limit 상태 조회"""
        if request.user.is_authenticated:
            user_key = f"user_{request.user.id}"
        else:
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                ip = x_forwarded_for.split(',')[0].strip()
            else:
                ip = request.META.get('REMOTE_ADDR', 'unknown')
            user_key = f"ip_{ip}"

        features = {
            '주소검색': 5,
            '토지조회': 10,
            '필지클릭': 10,
            '토지분석': 10,
            '매스스터디': 3,
        }

        status_data = {}
        for feature, limit in features.items():
            cache_key = f"rate_limit:{feature}:{user_key}"
            used = cache.get(cache_key, 0)
            status_data[feature] = {
                'used': used,
                'limit': limit,
                'remaining': max(0, limit - used),
            }

        return Response({
            'success': True,
            'user_key': user_key,
            'limits': status_data,
        })


class CacheClearView(APIView):
    """캐시 초기화 API (관리자 전용)"""
    permission_classes = [IsAdminUser]

    def post(self, request):
        """모든 캐시 삭제"""
        cache.clear()
        return Response({
            'success': True,
            'message': '모든 캐시가 초기화되었습니다.',
        })
