---
name: building-design
description: AI 건축 기획설계 서비스. 토지 검색, 법규 검토(건폐율/용적률), 매스 스터디 계산, 3D 시각화. "건물 설계", "매스 스터디", "법규 검토", "토지 분석", "수익성 분석" 요청 시 사용.
allowed-tools: Read, Grep, Glob, Bash(curl:*), Bash(npm:*), Bash(python:*), WebFetch
---

# AI 건축 기획설계 스킬

제주도 특화 건축 기획설계 서비스입니다.

## 핵심 기능

1. **토지 검색**: 주소로 토지 정보 조회
2. **법규 검토**: 건폐율, 용적률, 높이제한 확인
3. **매스 스터디**: 건물 배치 및 규모 계산
4. **수익성 분석**: 사업비, 예상 수익 산출

---

## API 엔드포인트

### Base URL
```
개발: http://localhost:8000/api/v1
프로덕션: https://ai-building-backend.onrender.com/api/v1
```

### 1. 주소 검색
```bash
GET /land/search/?q={검색어}
```
```json
{
  "success": true,
  "data": [
    { "title": "제주시 연동", "x": 126.5312, "y": 33.4996 }
  ]
}
```

### 2. 토지 상세
```bash
GET /land/{pnu}/?x={경도}&y={위도}
```
```json
{
  "success": true,
  "data": {
    "pnu": "5011010100103960001",
    "address_jibun": "제주시 연동 396",
    "parcel_area": 330.5,
    "use_zone": "제2종일반주거지역",
    "official_land_price": 2500000
  }
}
```

### 3. 법규 검토
```bash
GET /land/{pnu}/regulation/
```
```json
{
  "success": true,
  "data": {
    "use_zone": "제2종일반주거지역",
    "coverage": 60,
    "far": 200,
    "height_limit": null,
    "north_setback": 1.5,
    "max_building_area": 198.3,
    "max_floor_area": 661.0
  }
}
```

### 4. 매스 스터디 계산
```bash
POST /mass/calculate/
Content-Type: application/json

{
  "pnu": "5011010100103960001",
  "building_type": "다가구",
  "target_floors": 5,
  "setbacks": { "front": 3, "back": 2, "left": 1.5, "right": 1.5 }
}
```
```json
{
  "success": true,
  "data": {
    "building_area": 180.5,
    "total_floor_area": 850.2,
    "coverage_ratio": 54.5,
    "far_ratio": 180.0,
    "floors": 5,
    "height": 16.5,
    "legal_check": {
      "coverage_ok": true,
      "far_ok": true,
      "height_ok": true
    }
  }
}
```

---

## 제주도 건축 규제

| 용도지역 | 건폐율 | 용적률 | 높이제한 |
|---------|-------|-------|---------|
| 제1종일반주거 | 60% | 150% | 4층 이하 |
| 제2종일반주거 | 60% | 200% | - |
| 제3종일반주거 | 50% | 250% | - |
| 준주거지역 | 70% | 400% | - |
| 일반상업지역 | 80% | 800% | - |
| 근린상업지역 | 70% | 600% | - |

### 이격거리
- 정북방향: 높이의 1/2 (최소 1.5m)
- 인접대지: 0.5m 이상
- 도로측: 도로폭의 1/2

---

## 수익성 계산 공식

```typescript
// 건축비 (평당 825만원 기준)
const constructionCost = totalFloorArea * 2500000  // m² 기준

// 분양가 (평당 1,120만원 기준)
const revenue = totalFloorArea * 3400000  // m² 기준

// 토지비
const landCost = parcelArea * officialLandPrice

// 총 사업비
const totalCost = landCost + constructionCost * 1.1  // 기타비용 10%

// 수익
const profit = revenue - totalCost
const profitRate = (profit / totalCost) * 100
```

---

## 프로젝트 구조

```
frontend/
├── app/
│   ├── page.tsx          # 홈 (검색)
│   ├── search/page.tsx   # 지도 검색
│   └── design/page.tsx   # 3D 설계 시뮬레이션
├── components/
│   ├── Map/KakaoMap.tsx  # 카카오맵 + 지적도
│   └── Design/MassViewer3D.tsx  # Three.js 3D 뷰어
└── lib/
    └── api.ts            # API 클라이언트

backend/
└── apps/
    ├── land/             # 토지 검색, 법규 검토
    ├── mass/             # 매스 스터디
    └── core/             # Rate Limit, 공통
```

---

## 워크플로우

### 신규 기능 개발 시
1. API 엔드포인트 확인 (위 문서 참고)
2. TypeScript 타입 정의 (`lib/api.ts` 참고)
3. 컴포넌트 구현
4. 3D 시각화 연동 (Three.js)

### 토지 분석 요청 시
1. 주소 검색 API 호출
2. PNU로 토지 상세 조회
3. 법규 검토 API 호출
4. 매스 스터디 계산
5. 수익성 분석

---

## 외부 서비스

### Kakao Maps
```javascript
// API 키
NEXT_PUBLIC_KAKAO_MAP_KEY=7b745b9c98e7e984666fba573e992049

// 지적도 타일
https://map.daumcdn.net/map_k3f_prod/bakery/image_map_png/DISTRICT/v5/{z}/{y}/{x}.png
```

### VWorld API (Lambda Proxy)
```javascript
// Lambda URL
https://3a9op0tcy6.execute-api.ap-northeast-2.amazonaws.com/prod/

// Geocode 요청
{ "type": "geocode", "address": "제주시 연동" }

// 필지 조회
{ "type": "parcel", "x": 126.5312, "y": 33.4996 }
```

---

## 개발 명령어

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend
cd backend && pip install -r requirements.txt && python manage.py runserver

# 빌드
cd frontend && npm run build
```
