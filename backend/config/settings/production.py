import os
import dj_database_url
from .base import *

DEBUG = False
ALLOWED_HOSTS = [
    '.onrender.com',
    'localhost',
    '127.0.0.1',
]

# Render.com에서 제공하는 호스트 자동 추가
RENDER_EXTERNAL_HOSTNAME = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

DATABASES = {
    'default': dj_database_url.config(conn_max_age=600, ssl_require=True)
}

STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# CORS 설정
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://ai-building-design.vercel.app',
]
CORS_ALLOW_ALL_ORIGINS = True  # 개발 중에는 모든 출처 허용

# Cache timeouts
CACHE_TIMEOUTS = {
    'land_detail': 3600,
    'land_search': 1800,
    'regulation': 3600,
    'address_search': 1800,
    'geocode': 86400,
    'parcel_info': 604800,
    'use_zone': 604800,
}
