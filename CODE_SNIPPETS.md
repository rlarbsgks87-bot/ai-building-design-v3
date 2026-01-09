# 핵심 코드 스니펫

## 1. 카카오맵 + 지적도 + 클릭 이벤트

```typescript
// frontend/components/Map/KakaoMap.tsx

'use client'
import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window { kakao: any }
}

export function KakaoMap({ onParcelClick }: { onParcelClick?: (parcel: any) => void }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY

  // 스크립트 로드
  useEffect(() => {
    if (window.kakao?.maps) return

    const script = document.createElement('script')
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false&libraries=services`
    script.onload = () => {
      window.kakao.maps.load(() => initMap())
    }
    document.head.appendChild(script)
  }, [])

  const initMap = () => {
    if (!mapRef.current) return

    const options = {
      center: new window.kakao.maps.LatLng(33.499, 126.531), // 제주시
      level: 3,
    }
    const kakaoMap = new window.kakao.maps.Map(mapRef.current, options)
    setMap(kakaoMap)

    // 지적도 오버레이 추가
    kakaoMap.addOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT)

    // 클릭 이벤트
    const geocoder = new window.kakao.maps.services.Geocoder()

    window.kakao.maps.event.addListener(kakaoMap, 'click', (e: any) => {
      const lat = e.latLng.getLat()
      const lng = e.latLng.getLng()

      geocoder.coord2Address(lng, lat, (result: any, status: any) => {
        if (status !== window.kakao.maps.services.Status.OK) return

        const addr = result[0].address
        const jibunAddress = addr?.address_name || ''
        const bCode = addr?.b_code || ''
        const mountainYn = addr?.mountain_yn === 'Y'
        const mainNo = (addr?.main_address_no || '').padStart(4, '0')
        const subNo = (addr?.sub_address_no || '0').padStart(4, '0')

        // PNU 생성 (19자리)
        const pnu = bCode + (mountainYn ? '2' : '1') + mainNo + subNo

        onParcelClick?.({
          address_jibun: jibunAddress,
          pnu,
          latitude: lat,
          longitude: lng,
        })
      })
    })
  }

  return <div ref={mapRef} className="w-full h-full" />
}
```

---

## 2. 3D 매스 뷰어

```typescript
// frontend/components/Design/MassViewer3D.tsx

'use client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Line } from '@react-three/drei'
import * as THREE from 'three'

interface BuildingConfig {
  floors: number
  floorHeight: number
  setbacks: { front: number; back: number; left: number; right: number }
  buildingArea: number
}

export function MassViewer3D({ building, landArea }: { building: BuildingConfig; landArea: number }) {
  const landSide = Math.sqrt(landArea)
  const height = building.floors * building.floorHeight
  const width = Math.sqrt(building.buildingArea)
  const depth = width

  return (
    <div className="w-full h-full bg-gray-900">
      <Canvas shadows camera={{ position: [30, 25, 30], fov: 50 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[20, 30, 10]} castShadow />
        <Environment preset="city" />

        {/* 대지 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <planeGeometry args={[landSide, landSide]} />
          <meshStandardMaterial color="#1a472a" />
        </mesh>

        {/* 대지 경계선 (녹색) */}
        <Line
          points={[
            [-landSide/2, 0, -landSide/2],
            [landSide/2, 0, -landSide/2],
            [landSide/2, 0, landSide/2],
            [-landSide/2, 0, landSide/2],
            [-landSide/2, 0, -landSide/2],
          ]}
          color="#22c55e"
          lineWidth={3}
        />

        {/* 건물 매스 */}
        <mesh position={[0, height / 2, 0]} castShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color="#4f8ef7" transparent opacity={0.85} />
        </mesh>

        {/* 건물 외곽선 */}
        <lineSegments position={[0, height / 2, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
          <lineBasicMaterial color="#1e40af" />
        </lineSegments>

        <OrbitControls />
      </Canvas>
    </div>
  )
}
```

---

## 3. API 클라이언트

```typescript
// frontend/lib/api.ts

import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
})

// JWT 토큰 인터셉터
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const landApi = {
  search: (query: string) => api.get(`/land/search/?q=${encodeURIComponent(query)}`),
  getDetail: (pnu: string) => api.get(`/land/${pnu}/`),
  getRegulation: (pnu: string) => api.get(`/land/${pnu}/regulation/`),
}

export const massApi = {
  calculate: (data: {
    pnu: string
    building_type: string
    target_floors: number
    setbacks: { front: number; back: number; left: number; right: number }
  }) => api.post('/mass/calculate/', data),
}
```

---

## 4. Zustand 상태 관리

```typescript
// frontend/lib/store.ts

import { create } from 'zustand'

interface AppState {
  mapCenter: { lat: number; lng: number }
  setMapCenter: (center: { lat: number; lng: number }) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  mapCenter: { lat: 33.499, lng: 126.531 }, // 제주시 기본값
  setMapCenter: (center) => set({ mapCenter: center }),
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
}))
```

---

## 5. Django Rate Limit 데코레이터

```python
# backend/apps/core/decorators.py

from functools import wraps
from django.core.cache import cache
from rest_framework.response import Response
from rest_framework import status

def rate_limit_free(limit_per_day=10, feature_name='API'):
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(self, request, *args, **kwargs):
            # IP 기반 키
            ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', ''))
            if ',' in ip:
                ip = ip.split(',')[0].strip()

            cache_key = f'rate_limit:{feature_name}:{ip}'
            count = cache.get(cache_key, 0)

            if count >= limit_per_day:
                return Response({
                    'success': False,
                    'error': 'RATE_LIMIT_EXCEEDED',
                    'message': f'{feature_name} 일일 한도({limit_per_day}회)를 초과했습니다.',
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            # 카운트 증가 (자정까지 유지)
            from datetime import datetime, timedelta
            now = datetime.now()
            midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0)
            ttl = int((midnight - now).total_seconds())

            cache.set(cache_key, count + 1, ttl)

            return view_func(self, request, *args, **kwargs)
        return wrapper
    return decorator
```

---

## 6. render.yaml (배포 설정)

```yaml
# render.yaml

services:
  # Django Backend
  - type: web
    name: ai-building-api
    runtime: python
    plan: free
    region: singapore
    rootDir: backend
    buildCommand: pip install -r requirements.txt && python manage.py migrate
    startCommand: gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
    envVars:
      - key: DJANGO_SETTINGS_MODULE
        value: config.settings.production
      - key: DJANGO_SECRET_KEY
        generateValue: true
      - key: DATABASE_URL
        fromDatabase:
          name: ai-building-db
          property: connectionString

  # Next.js Frontend
  - type: web
    name: ai-building-frontend
    runtime: static
    rootDir: frontend
    buildCommand: npm install && npm run build
    staticPublishPath: out
    envVars:
      - key: NEXT_PUBLIC_API_URL
        value: https://ai-building-api.onrender.com/api/v1
      - key: NEXT_PUBLIC_KAKAO_MAP_KEY
        value: 7b745b9c98e7e984666fba573e992049

databases:
  - name: ai-building-db
    plan: free
    region: singapore
```

---

## 7. package.json (Frontend)

```json
{
  "name": "ai-building-frontend",
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.0.4",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-query": "^5.17.0",
    "axios": "^1.6.0",
    "three": "^0.160.0",
    "@react-three/fiber": "^8.15.0",
    "@react-three/drei": "^9.92.0",
    "zustand": "^4.4.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.0",
    "@types/three": "^0.160.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

---

## 8. requirements.txt (Backend)

```
Django>=4.2,<5.0
djangorestframework>=3.14.0
djangorestframework-simplejwt>=5.3.0
django-cors-headers>=4.3.0
psycopg2-binary>=2.9.9
gunicorn>=21.2.0
python-dotenv>=1.0.0
requests>=2.31.0
dj-database-url>=2.1.0
whitenoise>=6.6.0
```
