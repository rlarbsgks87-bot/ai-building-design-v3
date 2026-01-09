---
name: api-dev
description: Django REST Framework 백엔드 API 개발. 엔드포인트 추가, 모델 생성, 시리얼라이저, VWorld API 연동. "API 만들어줘", "엔드포인트 추가", "모델 생성", "백엔드 수정" 요청 시 사용.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(python:*), Bash(pip:*)
---

# Backend API 개발 스킬

Django 4.2 + Django REST Framework 백엔드 개발 가이드

## 기술 스택

- **Framework**: Django 4.2 + DRF
- **Auth**: SimpleJWT
- **DB**: PostgreSQL (Render)
- **외부 API**: VWorld, Kakao

---

## 프로젝트 구조

```
backend/
├── manage.py
├── requirements.txt
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── development.py
│   │   └── production.py
│   ├── urls.py
│   └── wsgi.py
└── apps/
    ├── accounts/     # 사용자 인증
    ├── land/         # 토지 검색, 법규
    ├── mass/         # 매스 스터디
    ├── analysis/     # 분석
    └── core/         # 공통 (Rate Limit)
```

---

## API View 작성

### 기본 구조
```python
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.core.decorators import rate_limit_free
from .serializers import MySerializer
from .services import MyService


class MyView(APIView):
    """API 설명"""

    @rate_limit_free(limit_per_day=10, feature_name='기능명')
    def get(self, request):
        serializer = MySerializer(data=request.query_params)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': '에러 메시지',
            }, status=status.HTTP_400_BAD_REQUEST)

        result = MyService().do_something(serializer.validated_data)

        if result.get('success'):
            return Response(result)

        return Response({
            'success': False,
            'error': 'NOT_FOUND',
            'message': '결과 없음',
        }, status=status.HTTP_404_NOT_FOUND)
```

---

## Model 작성

```python
from django.db import models


class Land(models.Model):
    pnu = models.CharField(max_length=19, unique=True, db_index=True)
    address_jibun = models.CharField(max_length=200)
    address_road = models.CharField(max_length=200, blank=True)
    parcel_area = models.FloatField(null=True)
    use_zone = models.CharField(max_length=100, blank=True)
    official_land_price = models.IntegerField(null=True)
    latitude = models.FloatField(null=True)
    longitude = models.FloatField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'lands'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.pnu} - {self.address_jibun}"
```

---

## Serializer 작성

```python
from rest_framework import serializers


class AddressSearchSerializer(serializers.Serializer):
    q = serializers.CharField(required=True, min_length=2)


class LandDetailSerializer(serializers.Serializer):
    pnu = serializers.CharField()
    address_jibun = serializers.CharField()
    address_road = serializers.CharField(allow_blank=True)
    parcel_area = serializers.FloatField(allow_null=True)
    use_zone = serializers.CharField(allow_blank=True)
    official_land_price = serializers.IntegerField(allow_null=True)
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()


class MassCalculateSerializer(serializers.Serializer):
    pnu = serializers.CharField(required=True)
    building_type = serializers.CharField(required=True)
    target_floors = serializers.IntegerField(min_value=1, max_value=50)
    setbacks = serializers.DictField(required=False)
```

---

## URL 패턴

```python
# apps/land/urls.py
from django.urls import path
from . import views

app_name = 'land'

urlpatterns = [
    path('search/', views.AddressSearchView.as_view(), name='search'),
    path('geocode/', views.GeocodeView.as_view(), name='geocode'),
    path('by-point/', views.ParcelByPointView.as_view(), name='by-point'),
    path('<str:pnu>/', views.LandDetailView.as_view(), name='detail'),
    path('<str:pnu>/regulation/', views.LandRegulationView.as_view(), name='regulation'),
]

# config/urls.py
from django.urls import path, include

urlpatterns = [
    path('api/v1/land/', include('apps.land.urls')),
    path('api/v1/mass/', include('apps.mass.urls')),
    path('api/v1/auth/', include('apps.accounts.urls')),
]
```

---

## Service 레이어

```python
# apps/land/services.py
import requests
from django.conf import settings


class VWorldService:
    """VWorld API 연동 서비스"""

    def __init__(self):
        self.lambda_url = settings.LAMBDA_PROXY_URL

    def search_address(self, query: str) -> dict:
        """주소 검색"""
        try:
            response = requests.post(
                self.lambda_url,
                json={'type': 'geocode', 'address': query},
                timeout=30
            )
            data = response.json()

            if data.get('status') == 'OK':
                return {
                    'success': True,
                    'data': self._parse_results(data.get('result', []))
                }
        except Exception as e:
            print(f"VWorld API error: {e}")

        return {'success': False, 'data': []}

    def get_parcel_by_point(self, x: float, y: float) -> dict:
        """좌표로 필지 조회"""
        try:
            response = requests.post(
                self.lambda_url,
                json={'type': 'parcel', 'x': x, 'y': y},
                timeout=30
            )
            return response.json()
        except Exception as e:
            return {'success': False, 'error': str(e)}
```

---

## Rate Limiting

```python
# apps/core/decorators.py
from functools import wraps
from rest_framework.response import Response
from rest_framework import status
from .models import RateLimitConfig


def rate_limit_free(limit_per_day: int, feature_name: str):
    """무료 티어 Rate Limit 데코레이터"""
    def decorator(func):
        @wraps(func)
        def wrapper(self, request, *args, **kwargs):
            # Rate limit 비활성화 체크
            config = RateLimitConfig.objects.filter(is_active=True).first()
            if config and not config.rate_limit_enabled:
                return func(self, request, *args, **kwargs)

            # IP 기반 제한 체크
            ip = get_client_ip(request)
            if is_rate_limited(ip, feature_name, limit_per_day):
                return Response({
                    'success': False,
                    'error': 'RATE_LIMIT_EXCEEDED',
                    'message': f'일일 {feature_name} 한도 초과 ({limit_per_day}회)',
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            return func(self, request, *args, **kwargs)
        return wrapper
    return decorator
```

---

## 응답 형식

### 성공
```json
{
  "success": true,
  "data": { ... }
}
```

### 실패
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "사용자 친화적 메시지"
}
```

### 에러 코드
| 코드 | 설명 |
|------|------|
| VALIDATION_ERROR | 입력값 검증 실패 |
| NOT_FOUND | 결과 없음 |
| RATE_LIMIT_EXCEEDED | 일일 한도 초과 |
| EXTERNAL_API_ERROR | 외부 API 오류 |
| UNAUTHORIZED | 인증 필요 |

---

## 환경변수

```env
# .env
SECRET_KEY=your-secret-key
DEBUG=True
DATABASE_URL=postgresql://...
VWORLD_API_KEY=your-vworld-key
LAMBDA_PROXY_URL=https://3a9op0tcy6.execute-api.ap-northeast-2.amazonaws.com/prod/
```

---

## 개발 명령어

```bash
# 마이그레이션
python manage.py makemigrations
python manage.py migrate

# 개발 서버
python manage.py runserver

# 슈퍼유저 생성
python manage.py createsuperuser

# 쉘
python manage.py shell
```

---

## 테스트

```python
# tests/test_land.py
from rest_framework.test import APITestCase


class LandAPITest(APITestCase):
    def test_search(self):
        response = self.client.get('/api/v1/land/search/', {'q': '제주시'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
```
