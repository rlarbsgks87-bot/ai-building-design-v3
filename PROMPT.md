# AI 건축 기획설계 서비스 - 개발 프롬프트

## 프로젝트 개요

제주도 특화 AI 건축 기획설계 서비스
- **첫 페이지**: DISCO 스타일 지도 검색 (https://disco.re)
- **설계 페이지**: ValueUpMap BuildIt 스타일 (https://valueupmap.com/buildit/landing)

---

## UI 흐름

```
[첫 페이지 - DISCO 스타일]
┌─────────────────────────────────────────────────────────┐
│  ┌──────────┐                                           │
│  │ 사이드바  │         지도 (카카오맵 + 지적도)            │
│  │          │                                           │
│  │ 주소     │         필지 클릭하면                       │
│  │ 용도지역  │         ← 사이드바에 정보 표시              │
│  │ 면적     │                                           │
│  │          │                                           │
│  │ [탭]     │                                           │
│  │ 실거래가 │                                           │
│  │ 토지    │                                           │
│  │ 건물    │                                           │
│  │ 법규    │                                           │
│  │          │                                           │
│  │ [설계    │                                           │
│  │  시뮬레이션]                                          │
│  │  버튼    │                                           │
│  └──────────┘                                           │
└─────────────────────────────────────────────────────────┘
                           │
                           │ 설계 버튼 클릭
                           ▼
[설계 페이지 - ValueUpMap BuildIt 스타일]
┌─────────────────────────────────────────────────────────┐
│  ┌──────────┐                                           │
│  │ 설정패널  │         3D 매스 뷰어                       │
│  │          │                                           │
│  │ 대지정보  │         ┌─────────────┐                   │
│  │ 면적/용도 │         │             │                   │
│  │          │         │   건물      │  ← 실시간 변경     │
│  │ [대안선택]│         │   매스      │                   │
│  │ 기본안   │         │             │                   │
│  │ 고층안   │         └─────────────┘                   │
│  │ 저층안   │                                           │
│  │          │         건축면적: 180m²                    │
│  │ [탭]     │         연면적: 850m²                      │
│  │ 설계조건  │         건폐율: 54.5%                     │
│  │ 층별면적  │         용적률: 180%                      │
│  │ 일조분석  │                                           │
│  │ 수익성   │                                           │
│  │ 대안비교  │                                           │
│  └──────────┘                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 기술 스택

### Backend
- Django 4.2 + DRF + JWT
- PostgreSQL (Render 무료)
- Rate Limiting (일일 제한)

### Frontend
- Next.js 14 + TypeScript
- Tailwind CSS
- Three.js (@react-three/fiber)
- Kakao Maps SDK

### 외부 API
- Kakao Maps: 지도, 지적도, Geocoder
- VWorld: 토지 정보 (Lambda Proxy)

---

## API 키

```
NEXT_PUBLIC_KAKAO_MAP_KEY=7b745b9c98e7e984666fba573e992049
NEXT_PUBLIC_VWORLD_API_KEY=739937A6-D680-3DE0-9D97-9D1187C5E6DA
LAMBDA_PROXY_URL=https://3a9op0tcy6.execute-api.ap-northeast-2.amazonaws.com/prod/
```

---

## 페이지별 상세

### 1. 첫 페이지 (DISCO 스타일)

**레이아웃**
- 전체 화면 지도
- 왼쪽 사이드바 (400px)
- 상단 검색창

**기능**
- 카카오맵 + 지적도 오버레이
- 필지 클릭 → 주소/PNU 추출
- 사이드바에 즉시 정보 표시
- 탭: 실거래가 / 토지 / 건물 / 등기설계
- 하단 "설계 시뮬레이션" 버튼

**DISCO 참조 요소**
- 주소가 상단에 크게 표시
- 용도지역, 면적 배지
- 탭 전환 UI
- 깔끔한 정보 카드

### 2. 설계 페이지 (ValueUpMap BuildIt 스타일)

**레이아웃**
- 어두운 배경 (gray-900)
- 왼쪽 설정 패널 (400px)
- 오른쪽 3D 뷰어

**기능**
- 대안 선택 (기본안/고층안/저층안)
- 설계 조건 슬라이더 (층수, 층고, 이격거리)
- 층별 면적표
- 일조 분석 (정북/인접대지)
- 수익성 분석 (비용/수익/이익률)
- 대안 비교 테이블

**3D 뷰어**
- Three.js 건물 매스
- 대지 경계선 (녹색)
- 이격거리 표시 (주황색)
- 층별 구분선
- 실시간 업데이트

---

## 파일 구조

```
ai-building-design-v3/
├── backend/
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   └── production.py
│   │   └── urls.py
│   ├── apps/
│   │   ├── accounts/    # JWT 인증
│   │   ├── land/        # 토지 API
│   │   ├── mass/        # 매스 계산
│   │   └── core/        # Rate Limit
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # 첫 페이지 (DISCO)
│   │   └── design/page.tsx    # 설계 페이지 (BuildIt)
│   ├── components/
│   │   ├── Map/KakaoMap.tsx
│   │   └── Design/MassViewer3D.tsx
│   └── lib/
│       ├── api.ts
│       └── store.ts
├── render.yaml
└── PROMPT.md
```

---

## 개발 순서

### Step 1: 프로젝트 초기화
```bash
# Backend
django-admin startproject config .
python manage.py startapp accounts
python manage.py startapp land
python manage.py startapp mass
python manage.py startapp core

# Frontend
npx create-next-app@14 frontend --typescript --tailwind --app
npm install three @react-three/fiber @react-three/drei zustand axios
```

### Step 2: Backend API
1. JWT 인증 설정
2. 토지 조회 API (Lambda Proxy 연동)
3. 매스 계산 API
4. Rate Limit 데코레이터

### Step 3: 첫 페이지 (DISCO 스타일)
1. 카카오맵 컴포넌트
2. 지적도 오버레이
3. 필지 클릭 → 주소 추출
4. 사이드바 UI
5. 탭 컴포넌트

### Step 4: 설계 페이지 (BuildIt 스타일)
1. 3D 매스 뷰어
2. 설정 패널
3. 층별 면적표
4. 수익성 분석
5. 대안 비교

### Step 5: 배포
1. render.yaml 작성
2. GitHub Push
3. Render 연결

---

## 참조 UI

### DISCO (첫 페이지)
- URL: https://disco.re
- 특징: 지도 중심, 사이드바 정보, 탭 UI

### ValueUpMap BuildIt (설계 페이지)
- URL: https://valueupmap.com/buildit/landing
- 특징: 3D 뷰어, 어두운 테마, 실시간 시뮬레이션
