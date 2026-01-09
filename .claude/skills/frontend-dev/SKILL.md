---
name: frontend-dev
description: Next.js 14 + TypeScript + Tailwind CSS 프론트엔드 개발. 컴포넌트 생성, 페이지 추가, 스타일링, Three.js 3D 작업. "컴포넌트 만들어줘", "페이지 추가", "UI 수정", "3D 뷰어" 요청 시 사용.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(npm:*)
---

# Frontend 개발 스킬

Next.js 14 + TypeScript + Tailwind CSS 프론트엔드 개발 가이드

## 기술 스택

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **3D**: Three.js + @react-three/fiber + @react-three/drei
- **State**: Zustand
- **HTTP**: Axios

---

## 프로젝트 구조

```
frontend/
├── app/
│   ├── layout.tsx        # 루트 레이아웃
│   ├── page.tsx          # 홈페이지
│   ├── providers.tsx     # Context Providers
│   ├── globals.css       # 전역 스타일
│   ├── search/page.tsx   # 검색 페이지
│   ├── design/page.tsx   # 설계 페이지
│   └── viewer/page.tsx   # 3D 뷰어
├── components/
│   ├── Map/              # 지도 컴포넌트
│   ├── Design/           # 3D 설계 컴포넌트
│   ├── Mass/             # 매스 관련
│   └── UI/               # 공통 UI
├── lib/
│   ├── api.ts            # API 클라이언트
│   └── store.ts          # Zustand 스토어
└── package.json
```

---

## 컴포넌트 작성 규칙

### 파일 구조
```typescript
'use client'  // 클라이언트 컴포넌트인 경우

import { useState } from 'react'
import { useAppStore } from '@/lib/store'

interface Props {
  title: string
  onAction: () => void
}

export function MyComponent({ title, onAction }: Props) {
  const [state, setState] = useState('')

  return (
    <div className="p-4 bg-white rounded-lg">
      {/* content */}
    </div>
  )
}
```

### 네이밍 규칙
- 컴포넌트: PascalCase (`MyComponent.tsx`)
- 함수/변수: camelCase
- 상수: UPPER_SNAKE_CASE
- 타입/인터페이스: PascalCase with 'I' prefix 없이

---

## Tailwind CSS 가이드

### 색상 시스템
```css
/* 주요 색상 */
bg-blue-600      /* 프라이머리 */
bg-gray-900      /* 다크 배경 */
bg-white         /* 라이트 배경 */
text-gray-400    /* 보조 텍스트 */
text-green-400   /* 성공/적합 */
text-red-400     /* 에러/초과 */
```

### 자주 쓰는 패턴
```jsx
{/* 카드 */}
<div className="bg-white rounded-lg shadow-lg p-4">

{/* 버튼 - 프라이머리 */}
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">

{/* 입력 필드 */}
<input className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">

{/* 플렉스 레이아웃 */}
<div className="flex items-center justify-between gap-4">

{/* 그리드 */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

---

## Three.js / React Three Fiber

### 기본 구조
```tsx
'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'

export function Viewer3D() {
  return (
    <Canvas shadows camera={{ position: [20, 20, 20], fov: 50 }}>
      {/* 조명 */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />

      {/* 환경 */}
      <Environment preset="city" />

      {/* 오브젝트 */}
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#4f8ef7" />
      </mesh>

      {/* 바닥 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* 컨트롤 */}
      <OrbitControls />
    </Canvas>
  )
}
```

### 동적 로딩 (SSR 비활성화)
```tsx
import dynamic from 'next/dynamic'

const Viewer3D = dynamic(
  () => import('@/components/Design/Viewer3D').then(mod => mod.Viewer3D),
  { ssr: false, loading: () => <div>Loading...</div> }
)
```

---

## API 연동

### API 클라이언트 사용
```typescript
import { landApi, massApi } from '@/lib/api'

// 토지 검색
const result = await landApi.search('제주시 연동')

// 법규 검토
const regulation = await landApi.getRegulation(pnu)

// 매스 계산
const mass = await massApi.calculate({
  pnu: '5011010100103960001',
  building_type: '다가구',
  target_floors: 5,
})
```

### 타입 정의
```typescript
interface LandDetail {
  pnu: string
  address_jibun: string
  parcel_area: number | null
  use_zone: string
  official_land_price: number | null
}

interface MassResult {
  building_area: number
  total_floor_area: number
  coverage_ratio: number
  far_ratio: number
  floors: number
  height: number
}
```

---

## 상태 관리 (Zustand)

```typescript
// lib/store.ts
import { create } from 'zustand'

interface AppState {
  mapCenter: { lat: number; lng: number }
  setMapCenter: (center: { lat: number; lng: number }) => void
}

export const useAppStore = create<AppState>((set) => ({
  mapCenter: { lat: 33.4996, lng: 126.5312 },
  setMapCenter: (center) => set({ mapCenter: center }),
}))

// 컴포넌트에서 사용
const { mapCenter, setMapCenter } = useAppStore()
```

---

## 개발 명령어

```bash
# 개발 서버
npm run dev

# 빌드
npm run build

# 타입 체크
npx tsc --noEmit

# 린트
npm run lint
```
