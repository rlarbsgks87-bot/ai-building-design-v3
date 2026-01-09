from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from apps.core.views import RateLimitResetView, RateLimitToggleView, CacheClearView, SystemSettingsView


def health_check(request):
    return JsonResponse({
        'status': 'ok',
        'service': 'ai-building-api',
        'version': '0.1.0'
    })


def api_root(request):
    return JsonResponse({
        'message': 'AI 건축 기획설계 서비스 API',
        'version': 'v1',
        'endpoints': {
            'health': '/health/',
            'auth': '/api/v1/auth/',
            'land': '/api/v1/land/',
            'mass': '/api/v1/mass/',
        }
    })


urlpatterns = [
    path('', api_root),
    path('health/', health_check),
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.accounts.urls')),
    path('api/v1/land/', include('apps.land.urls')),
    path('api/v1/mass/', include('apps.mass.urls')),
    path('api/v1/analysis/', include('apps.analysis.urls')),
    # 관리자 API
    path('api/v1/admin/settings/', SystemSettingsView.as_view(), name='system-settings'),
    path('api/v1/admin/rate-limit/', RateLimitResetView.as_view(), name='rate-limit-admin'),
    path('api/v1/admin/rate-limit/toggle/', RateLimitToggleView.as_view(), name='rate-limit-toggle'),
    path('api/v1/admin/cache-clear/', CacheClearView.as_view(), name='cache-clear'),
]
