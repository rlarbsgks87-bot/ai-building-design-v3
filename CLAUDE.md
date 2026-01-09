# AI 건축 기획설계 서비스

## 프로젝트 설명

제주도 특화 AI 건축 기획설계 서비스입니다. 토지 검색, 법규 검토, 3D 매스 스터디, 수익성 분석을 제공합니다.

## 기술 스택

### Backend
- Django 4.2 + Django REST Framework
- JWT 인증 (SimpleJWT)
- PostgreSQL (Render)
- Rate Limiting (무료 티어 제한)

### Frontend
- Next.js 14 + TypeScript
- Tailwind CSS
- Three.js + @react-three/fiber (3D 뷰어)
- Zustand (상태관리)
- Axios (API 클라이언트)

### 외부 API
- Kakao Maps SDK (지도, 지적도)
- VWorld API (필지 정보, WMS/WFS)
- AWS Lambda Proxy (VWorld CORS 우회)

---

## API 키 및 환경변수

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api/v1
NEXT_PUBLIC_KAKAO_MAP_KEY=7b745b9c98e7e984666fba573e992049
```

### Backend (.env)
```env
SECRET_KEY=your-django-secret-key
DEBUG=False
DATABASE_URL=postgresql://...
VWORLD_API_KEY=your-vworld-key
LAMBDA_PROXY_URL=https://3a9op0tcy6.execute-api.ap-northeast-2.amazonaws.com/prod/
```

---

## API 엔드포인트

### Base URL
- 개발: `http://localhost:8000/api/v1`
- 프로덕션: `https://your-backend.onrender.com/api/v1`

### 1. 주소 검색
```
GET /land/search/?q={검색어}
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "제주특별자치도 제주시 연동",
      "address": "제주시 연동 123",
      "road_address": "제주시 연북로 123",
      "x": 126.5312,
      "y": 33.4996
    }
  ]
}
```

### 2. 토지 상세 정보
```
GET /land/{pnu}/?x={경도}&y={위도}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "pnu": "5011010100103960001",
    "address_jibun": "제주시 연동 396",
    "address_road": "제주시 연북로 123",
    "parcel_area": 330.5,
    "use_zone": "제2종일반주거지역",
    "official_land_price": 2500000,
    "latitude": 33.4996,
    "longitude": 126.5312
  }
}
```

### 3. 법규 검토
```
GET /land/{pnu}/regulation/
```
**Response:**
```json
{
  "success": true,
  "data": {
    "pnu": "5011010100103960001",
    "address": "제주시 연동 396",
    "parcel_area": 330.5,
    "use_zone": "제2종일반주거지역",
    "coverage": 60,
    "far": 200,
    "height_limit": null,
    "north_setback": 1.5,
    "note": "제주도 특별 규제 적용",
    "max_building_area": 198.3,
    "max_floor_area": 661.0
  }
}
```

### 4. 좌표로 필지 조회
```
POST /land/by-point/
Content-Type: application/json

{
  "x": 126.5312,
  "y": 33.4996
}
```

### 5. 매스 스터디 계산
```
POST /mass/calculate/
Content-Type: application/json

{
  "pnu": "5011010100103960001",
  "building_type": "다가구",
  "target_floors": 5,
  "setbacks": {
    "front": 3,
    "back": 2,
    "left": 1.5,
    "right": 1.5
  }
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "pnu": "5011010100103960001",
    "building_area": 180.5,
    "total_floor_area": 850.2,
    "coverage_ratio": 54.5,
    "far_ratio": 180.0,
    "floors": 5,
    "height": 16.5,
    "legal_check": {
      "coverage_ok": true,
      "far_ok": true,
      "height_ok": true,
      "setback_ok": true
    },
    "legal_limits": {
      "coverage": 60,
      "far": 200,
      "height_limit": null
    }
  }
}
```

### 6. 매스 지오메트리 (3D용)
```
GET /mass/{id}/geometry/
```
**Response:**
```json
{
  "success": true,
  "data": {
    "type": "box",
    "format": "simple",
    "dimensions": {
      "width": 12.5,
      "height": 16.5,
      "depth": 14.4
    },
    "position": {
      "x": 0,
      "y": 8.25,
      "z": 0
    },
    "land": {
      "latitude": 33.4996,
      "longitude": 126.5312
    }
  }
}
```

---

## 프로젝트 구조

```
ai-building-design-v3/
├── CLAUDE.md              # 이 파일
├── CODE_SNIPPETS.md       # 코드 스니펫
├── PROMPT.md              # 프롬프트 가이드
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── development.py
│   │   │   └── production.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   └── apps/
│       └── land/
│           ├── models.py      # Land 모델
│           ├── views.py       # API Views
│           ├── services.py    # VWorld, Lambda 연동
│           ├── serializers.py # DRF Serializers
│           └── urls.py        # URL 패턴
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── app/
│   │   ├── page.tsx          # 홈 (검색)
│   │   ├── search/page.tsx   # 지도 검색
│   │   ├── design/page.tsx   # 설계 시뮬레이션
│   │   └── layout.tsx
│   ├── components/
│   │   ├── Map/
│   │   │   └── KakaoMap.tsx  # 카카오맵 + 지적도
│   │   ├── Design/
│   │   │   ├── MassViewer3D.tsx  # 3D 뷰어
│   │   │   └── Preview3D.tsx     # 홈 프리뷰
│   │   └── UI/
│   │       ├── MassForm.tsx
│   │       └── MassResult.tsx
│   └── lib/
│       ├── api.ts            # API 클라이언트
│       └── store.ts          # Zustand 상태
```

---

## UI 플로우

### 1. 홈페이지 (`/`)
- DISCO.re 스타일 디자인
- 주소 검색 입력
- 3D 프리뷰 (자동 회전)
- 샘플 버튼 (상업지역, 주거지역)

### 2. 검색 페이지 (`/search`)
- 전체 화면 카카오맵
- 지적도 오버레이 표시
- 필지 클릭 → 사이드바 정보 표시
- 탭: 실거래가 / 토지 / 건물 / 법규
- "설계 시뮬레이션" 버튼

### 3. 설계 페이지 (`/design`)
- Three.js 3D 매스 뷰어
- 왼쪽 패널: 설계 조건 설정
  - 층수/층고 슬라이더
  - 이격거리 입력
  - 건폐율 조정
- 탭: 설계조건 / 층별면적 / 일조분석 / 수익성 / 대안비교
- 3가지 대안 비교 (기본안, 고층안, 저층안)
- 자동 최적화 버튼

---

## 제주도 건축 규제

### 용도지역별 기준
| 용도지역 | 건폐율 | 용적률 | 높이제한 |
|---------|-------|-------|---------|
| 제1종일반주거 | 60% | 150% | 4층 이하 |
| 제2종일반주거 | 60% | 200% | - |
| 제3종일반주거 | 50% | 250% | - |
| 준주거지역 | 70% | 400% | - |
| 일반상업지역 | 80% | 800% | - |
| 근린상업지역 | 70% | 600% | - |
| 자연녹지지역 | 20% | 80% | - |

### 이격거리
- 정북방향: 높이의 1/2 (최소 1.5m)
- 인접대지: 0.5m 이상
- 도로측: 도로폭의 1/2

---

## 개발 명령어

### Backend
```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### 빌드
```bash
# Frontend 빌드
cd frontend && npm run build

# Backend (Render)
gunicorn config.wsgi:application
```

---

## Rate Limiting (무료 티어)

| 기능 | 일일 제한 |
|-----|----------|
| 주소검색 | 5회 |
| 토지조회 | 10회 |
| 필지클릭 | 10회 |
| 토지분석 | 10회 |

> Admin API로 Rate Limit 비활성화 가능: `POST /admin/rate-limit/toggle/`

---

## TypeScript 타입 정의

```typescript
interface LandDetail {
  pnu: string
  address_jibun: string
  address_road: string
  parcel_area: number | null
  use_zone: string
  official_land_price: number | null
  latitude: number
  longitude: number
}

interface Regulation {
  pnu: string
  address: string
  parcel_area: number
  use_zone: string
  coverage: number
  far: number
  height_limit: string | null
  north_setback: number
  note: string | null
  max_building_area: number
  max_floor_area: number
}

interface MassResult {
  id: string
  pnu: string
  building_area: number
  total_floor_area: number
  coverage_ratio: number
  far_ratio: number
  floors: number
  height: number
  legal_check: {
    coverage_ok: boolean
    far_ok: boolean
    height_ok: boolean
    setback_ok: boolean
  }
}

interface BuildingConfig {
  id: string
  name: string
  floors: number
  floorHeight: number
  setbacks: { front: number; back: number; left: number; right: number }
  buildingArea: number
  totalFloorArea: number
  coverageRatio: number
  farRatio: number
  estimatedCost: number
  estimatedRevenue: number
}
```

---

## 외부 서비스 연동

### Kakao Maps SDK
```javascript
// 지적도 타일 URL
`https://map.daumcdn.net/map_k3f_prod/bakery/image_map_png/DISTRICT/v5/{z}/{y}/{x}.png`
```

### VWorld API (Lambda Proxy 경유)
```javascript
// Geocode
POST https://lambda-url/prod/
{ "type": "geocode", "address": "제주시 연동" }

// 필지 조회
POST https://lambda-url/prod/
{ "type": "parcel", "x": 126.5312, "y": 33.4996 }
```

---

## 주의사항

1. **CORS**: Backend에서 Frontend 도메인 허용 필요
2. **API 키 보안**: .env 파일 gitignore 필수
3. **Render 슬립**: 무료 티어 15분 비활성시 슬립 → 첫 요청 30초 대기
4. **Rate Limit**: 무료 사용자 일일 제한 적용
