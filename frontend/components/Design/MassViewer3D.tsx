'use client'

import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, Text, Environment, Line, PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import * as THREE from 'three'

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

// 북쪽 일조권 사선 제한 계산 (건축법 시행령 제86조)
// 전용주거/일반주거지역 적용
//
// 법 조문:
// 1. 높이 10미터 이하인 부분: 인접 대지경계선으로부터 1.5미터 이상
// 2. 높이 10미터를 초과하는 부분: 인접 대지경계선으로부터 해당 건축물 각 부분 높이의 2분의 1 이상
//
// 해석:
// - 10m 이하: 1.5m 이격
// - 10m 초과: 해당 높이 ÷ 2 이격 (예: 20m 높이 → 10m 이격)
// - 사선 비율: 1:2 (수평:수직)
// - 사선 시작점: 경계선에서 10m 높이 → 5m 이격 (10÷2=5)
export function calculateNorthSetback(height: number, useZone?: string): number {
  // 주거지역이 아니면 일조권 적용 안함
  if (useZone && !useZone.includes('주거')) {
    return 0
  }

  if (height <= 10) {
    // 10m 이하: 1.5m 이격
    return 1.5
  } else {
    // 10m 초과: 해당 높이의 1/2 이격
    // 법 조문: "해당 건축물 각 부분 높이의 2분의 1 이상"
    // 예: 12m → 6m, 14m → 7m, 20m → 10m
    return height / 2
  }
}

// 특정 높이에서의 북쪽 이격거리 계산 (층별 사선제한)
export function getNorthSetbackAtHeight(currentHeight: number, baseSetback: number = 0): number {
  if (currentHeight <= 10) {
    // 10m 이하: 1.5m 이격
    return Math.max(1.5, baseSetback)
  } else {
    // 10m 초과: 해당 높이의 1/2 이격
    const slopeSetback = currentHeight / 2
    return Math.max(slopeSetback, baseSetback)
  }
}

interface MassViewer3DProps {
  building: BuildingConfig
  landArea: number
  useZone?: string  // 용도지역 (주거지역인 경우 일조권 적용)
  showNorthSetback?: boolean  // 북쪽 일조권 표시 여부
  floorSetbacks?: number[]  // 층별 북측 이격거리 (계단형 매스용)
}

// 대지 크기 계산 (정사각형 가정)
function calculateLandDimensions(area: number) {
  const side = Math.sqrt(area)
  return { width: side, depth: side }
}

// 건물 크기 계산
function calculateBuildingDimensions(
  landWidth: number,
  landDepth: number,
  setbacks: BuildingConfig['setbacks'],
  buildingArea: number
) {
  // 이격거리 적용 후 가용 영역
  const availableWidth = landWidth - setbacks.left - setbacks.right
  const availableDepth = landDepth - setbacks.front - setbacks.back

  // 건축면적에 맞게 조정
  const ratio = Math.sqrt(buildingArea / (availableWidth * availableDepth))
  const width = Math.min(availableWidth, availableWidth * ratio)
  const depth = Math.min(availableDepth, availableDepth * ratio)

  return { width: Math.max(5, width), depth: Math.max(5, depth) }
}

// 층별 색상 정의
const FLOOR_COLORS = {
  commercial: '#6b7280',  // 1층 상가 - 회색
  residential: '#3b82f6', // 2층 이상 주거 - 파란색
  rooftop: '#ef4444',     // 옥탑 - 빨간색
}

// 건물 매스 컴포넌트 (계단형 매스 지원)
function BuildingMass({ building, landDimensions, floorSetbacks, useZone }: {
  building: BuildingConfig
  landDimensions: { width: number; depth: number }
  floorSetbacks?: number[]  // 층별 북측 이격거리
  useZone?: string
}) {
  const { width: landWidth, depth: landDepth } = landDimensions

  // 계단형 여부 확인
  const isSteppedBuilding = floorSetbacks && floorSetbacks.length > 0

  // 1층 기준 북측 이격거리 (계단형이면 첫번째 값 사용)
  const baseBackSetback = isSteppedBuilding && floorSetbacks && floorSetbacks[0]
    ? floorSetbacks[0]
    : building.setbacks.back

  // 건물 가용 영역 계산
  const availableWidth = landWidth - building.setbacks.left - building.setbacks.right
  const availableDepth = landDepth - building.setbacks.front - baseBackSetback

  // 건물 너비는 가용 영역 전체 사용
  const buildingWidth = Math.max(3, availableWidth)

  // 건물 높이 계산
  const buildingHeight = building.floors * building.floorHeight

  // 건물 중심 위치 계산
  // X: 좌우 이격거리 차이 반영
  const centerX = (building.setbacks.left - building.setbacks.right) / 2
  // Z: 전면 이격거리부터 시작해서 가용 깊이의 중앙 (북쪽이 +Z)
  // 전면(남쪽) 경계: -landDepth/2 + front
  // 후면(북쪽) 경계: landDepth/2 - back
  // 건물 시작점(남쪽): -landDepth/2 + front
  // 건물 끝점(북쪽): landDepth/2 - back (1층 기준)
  // 건물 중심 Z = 전면경계 + 가용깊이/2 = -landDepth/2 + front + availableDepth/2
  const baseCenterZ = -landDepth / 2 + building.setbacks.front + availableDepth / 2

  // 층별 데이터 생성 (계단형 매스)
  const floors = useMemo(() => {
    const result = []
    const hasRooftop = building.floors >= 3
    const isResidential = useZone?.includes('주거')

    for (let i = 0; i < building.floors; i++) {
      const floorNum = i + 1
      const floorTopHeight = floorNum * building.floorHeight

      // 해당 층의 북측 이격거리
      let backSetback = baseBackSetback
      if (isSteppedBuilding && floorSetbacks && floorSetbacks[i] !== undefined) {
        backSetback = floorSetbacks[i]
      } else if (isResidential) {
        backSetback = getNorthSetbackAtHeight(floorTopHeight, building.setbacks.back)
      }

      // 해당 층의 깊이 계산
      const floorAvailableDepth = landDepth - building.setbacks.front - backSetback
      const floorDepth = Math.max(1, floorAvailableDepth)

      // 색상 및 라벨
      let color: string
      let label: string
      if (floorNum === 1) {
        color = FLOOR_COLORS.commercial
        label = '상가'
      } else if (hasRooftop && floorNum === building.floors) {
        color = FLOOR_COLORS.rooftop
        label = '옥탑'
      } else {
        color = FLOOR_COLORS.residential
        label = '주거'
      }

      // 이 층의 중심 Z 위치
      // 각 층은 전면(남쪽)에서 시작해서 북쪽으로 해당 층의 깊이만큼
      const floorStartZ = -landDepth / 2 + building.setbacks.front
      const floorCenterZ = floorStartZ + floorDepth / 2

      result.push({
        floor: floorNum,
        color,
        label,
        y: i * building.floorHeight + building.floorHeight / 2,
        depth: floorDepth,
        width: buildingWidth,
        backSetback,
        centerZ: floorCenterZ,
      })
    }
    return result
  }, [building, buildingWidth, floorSetbacks, landDepth, useZone, isSteppedBuilding, baseBackSetback])

  return (
    <group position={[centerX, 0, 0]}>
      {/* 층별 매스 (계단형) */}
      {floors.map((floor, idx) => (
        <group key={floor.floor}>
          {/* 층 매스 */}
          <mesh
            position={[0, floor.y, floor.centerZ]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[
              floor.width - 0.1,
              building.floorHeight - 0.05,
              floor.depth - 0.1
            ]} />
            <meshStandardMaterial
              color={floor.color}
              transparent
              opacity={0.9}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* 층 외곽선 */}
          <lineSegments position={[0, floor.y, floor.centerZ]}>
            <edgesGeometry args={[new THREE.BoxGeometry(
              floor.width - 0.1,
              building.floorHeight - 0.05,
              floor.depth - 0.1
            )]} />
            <lineBasicMaterial color="#000000" linewidth={1} transparent opacity={0.3} />
          </lineSegments>

          {/* 층 라벨 (옆면) */}
          <Text
            position={[floor.width / 2 + 0.5, floor.y, floor.centerZ]}
            fontSize={0.8}
            color="#ffffff"
            anchorX="left"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000000"
          >
            {`${floor.floor}F ${floor.label}`}
          </Text>

          {/* 계단형일 때 이격거리 표시 (상위 층에서 변경시) */}
          {isSteppedBuilding && idx > 0 && floor.backSetback !== floors[idx - 1].backSetback && (
            <Text
              position={[0, floor.y - building.floorHeight / 2 + 0.3, floor.centerZ + floor.depth / 2 + 0.5]}
              fontSize={0.5}
              color="#ff8800"
              anchorX="center"
              outlineWidth={0.03}
              outlineColor="#000000"
            >
              {`↑${floor.backSetback.toFixed(1)}m`}
            </Text>
          )}
        </group>
      ))}

      {/* 전체 높이 표시 */}
      <Text
        position={[buildingWidth / 2 + 2, buildingHeight / 2, 0]}
        fontSize={1.2}
        color="#ffffff"
        anchorX="left"
        outlineWidth={0.1}
        outlineColor="#000000"
      >
        {`${buildingHeight.toFixed(1)}m`}
      </Text>

      {/* 층수 표시 */}
      <Text
        position={[0, buildingHeight + 2, floors[floors.length - 1]?.centerZ || 0]}
        fontSize={1.5}
        color="#ffffff"
        anchorX="center"
        outlineWidth={0.1}
        outlineColor="#000000"
      >
        {`${building.floors}층`}
      </Text>
    </group>
  )
}

// 층별 구분선
function FloorLines({
  width,
  height,
  depth,
  floorHeight,
  position,
}: {
  width: number
  height: number
  depth: number
  floorHeight: number
  position: [number, number, number]
}) {
  const lines = useMemo(() => {
    const floors = Math.floor(height / floorHeight)
    const result = []

    for (let i = 1; i <= floors; i++) {
      const y = i * floorHeight - height / 2
      const points = [
        new THREE.Vector3(-width / 2, y, -depth / 2),
        new THREE.Vector3(width / 2, y, -depth / 2),
        new THREE.Vector3(width / 2, y, depth / 2),
        new THREE.Vector3(-width / 2, y, depth / 2),
        new THREE.Vector3(-width / 2, y, -depth / 2),
      ]
      result.push(points)
    }

    return result
  }, [width, height, depth, floorHeight])

  return (
    <group position={position}>
      {lines.map((points, i) => (
        <Line key={i} points={points} color="#93c5fd" lineWidth={1} />
      ))}
    </group>
  )
}

// 대지 경계 및 이격선
function LandBoundary({
  landDimensions,
  setbacks,
  actualBackSetback,
}: {
  landDimensions: { width: number; depth: number }
  setbacks: BuildingConfig['setbacks']
  actualBackSetback?: number  // 실제 1층 북측 이격거리 (floorSetbacks[0])
}) {
  const { width, depth } = landDimensions

  // 실제 표시할 이격거리 (계단형이면 1층 기준)
  const displaySetbacks = {
    ...setbacks,
    back: actualBackSetback ?? setbacks.back,
  }

  return (
    <group>
      {/* 대지 바닥 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#1a472a" side={THREE.DoubleSide} />
      </mesh>

      {/* 대지 경계선 */}
      <Line
        points={[
          [-width / 2, 0.01, -depth / 2],
          [width / 2, 0.01, -depth / 2],
          [width / 2, 0.01, depth / 2],
          [-width / 2, 0.01, depth / 2],
          [-width / 2, 0.01, -depth / 2],
        ]}
        color="#22c55e"
        lineWidth={3}
      />

      {/* 이격거리 표시 */}
      <SetbackLines landDimensions={landDimensions} setbacks={displaySetbacks} />

      {/* 대지 모서리 포인트 */}
      {[
        [-width / 2, 0.02, -depth / 2],
        [width / 2, 0.02, -depth / 2],
        [width / 2, 0.02, depth / 2],
        [-width / 2, 0.02, depth / 2],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshStandardMaterial color="#22c55e" />
        </mesh>
      ))}
    </group>
  )
}

// 이격거리 표시선
function SetbackLines({
  landDimensions,
  setbacks,
}: {
  landDimensions: { width: number; depth: number }
  setbacks: BuildingConfig['setbacks']
}) {
  const { width, depth } = landDimensions

  // 이격거리 내부 경계
  const innerPoints: [number, number, number][] = [
    [-width / 2 + setbacks.left, 0.03, -depth / 2 + setbacks.front],
    [width / 2 - setbacks.right, 0.03, -depth / 2 + setbacks.front],
    [width / 2 - setbacks.right, 0.03, depth / 2 - setbacks.back],
    [-width / 2 + setbacks.left, 0.03, depth / 2 - setbacks.back],
    [-width / 2 + setbacks.left, 0.03, -depth / 2 + setbacks.front],
  ]

  return (
    <group>
      {/* 건축 가능 영역 (점선) */}
      <Line
        points={innerPoints}
        color="#f59e0b"
        lineWidth={2}
        dashed
        dashSize={0.5}
        gapSize={0.3}
      />

      {/* 이격거리 레이블 */}
      {setbacks.front > 0 && (
        <Text
          position={[0, 0.5, -depth / 2 + setbacks.front / 2]}
          fontSize={0.8}
          color="#f59e0b"
          anchorX="center"
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {`${setbacks.front}m`}
        </Text>
      )}
      {setbacks.back > 0 && (
        <Text
          position={[0, 0.5, depth / 2 - setbacks.back / 2]}
          fontSize={0.8}
          color="#f59e0b"
          anchorX="center"
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {`${setbacks.back}m`}
        </Text>
      )}
    </group>
  )
}

// 평면 뷰 치수 표시 컴포넌트
function PlanViewDimensions({
  landDimensions,
  setbacks,
  buildingWidth,
  buildingDepth,
  floorSetbacks,
  floorHeight,
}: {
  landDimensions: { width: number; depth: number }
  setbacks: BuildingConfig['setbacks']
  buildingWidth: number
  buildingDepth: number
  floorSetbacks?: number[]
  floorHeight: number
}) {
  const { width, depth } = landDimensions

  // 치수선 높이 (지면 위)
  const dimY = 0.2

  // 텍스트 회전 (평면뷰용 - 바닥에 눕힌 텍스트)
  const textRotation: [number, number, number] = [-Math.PI / 2, 0, 0]
  const textRotationVertical: [number, number, number] = [-Math.PI / 2, 0, -Math.PI / 2]

  // 건물 실제 위치 계산 (BuildingMass와 동일한 로직)
  // X 중심: 좌우 이격거리 차이 반영
  const buildingCenterX = (setbacks.left - setbacks.right) / 2
  // Z: 전면 이격거리부터 시작
  const buildingFrontZ = -depth / 2 + setbacks.front
  const buildingCenterZ = buildingFrontZ + buildingDepth / 2

  // 건물 영역 좌표 (실제 위치 기준)
  const buildingLeft = buildingCenterX - buildingWidth / 2
  const buildingRight = buildingCenterX + buildingWidth / 2

  // 층별 이격거리 변경점 계산 (중복 제거, 건물 깊이 포함)
  const uniqueSetbacks = useMemo(() => {
    if (!floorSetbacks || floorSetbacks.length === 0) return []

    const result: { floor: number; setback: number; height: number; buildingDepth: number }[] = []
    let prevSetback = -1

    floorSetbacks.forEach((setback, idx) => {
      if (Math.abs(setback - prevSetback) > 0.1) {
        // 해당 층의 건물 깊이 = 대지깊이 - 전면이격 - 북측이격
        const buildingDepth = depth - setbacks.front - setback
        result.push({
          floor: idx + 1,
          setback,
          height: (idx + 1) * floorHeight,
          buildingDepth: Math.max(0, buildingDepth),
        })
        prevSetback = setback
      }
    })

    return result
  }, [floorSetbacks, floorHeight, depth, setbacks.front])

  return (
    <group>
      {/* === 대지 치수 === */}
      {/* 대지 가로 치수선 (남쪽/아래쪽 - 화면에서는 아래) */}
      <Line
        points={[
          [-width / 2, dimY, -depth / 2 - 2],
          [width / 2, dimY, -depth / 2 - 2],
        ]}
        color="#22c55e"
        lineWidth={2}
      />
      <Line points={[[-width / 2, dimY, -depth / 2 - 1.5], [-width / 2, dimY, -depth / 2 - 2.5]]} color="#22c55e" lineWidth={1} />
      <Line points={[[width / 2, dimY, -depth / 2 - 1.5], [width / 2, dimY, -depth / 2 - 2.5]]} color="#22c55e" lineWidth={1} />
      <Text
        position={[0, dimY + 0.3, -depth / 2 - 2.5]}
        fontSize={0.8}
        color="#22c55e"
        anchorX="center"
        rotation={textRotation}
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {`${width.toFixed(1)}m`}
      </Text>

      {/* 대지 세로 치수선 (왼쪽) */}
      <Line
        points={[
          [-width / 2 - 2, dimY, -depth / 2],
          [-width / 2 - 2, dimY, depth / 2],
        ]}
        color="#22c55e"
        lineWidth={2}
      />
      <Line points={[[-width / 2 - 1.5, dimY, -depth / 2], [-width / 2 - 2.5, dimY, -depth / 2]]} color="#22c55e" lineWidth={1} />
      <Line points={[[-width / 2 - 1.5, dimY, depth / 2], [-width / 2 - 2.5, dimY, depth / 2]]} color="#22c55e" lineWidth={1} />
      <Text
        position={[-width / 2 - 2.5, dimY + 0.3, 0]}
        fontSize={0.8}
        color="#22c55e"
        anchorX="center"
        rotation={textRotationVertical}
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {`${depth.toFixed(1)}m`}
      </Text>

      {/* === 이격거리 치수 === */}
      {/* 전면 이격거리 (남쪽/도로측) */}
      <Text
        position={[0, dimY + 0.3, -depth / 2 + setbacks.front / 2]}
        fontSize={0.6}
        color="#f59e0b"
        anchorX="center"
        rotation={textRotation}
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {`전면 ${setbacks.front.toFixed(1)}m`}
      </Text>

      {/* 좌측 이격거리 */}
      <Text
        position={[-width / 2 + setbacks.left / 2, dimY + 0.3, 0]}
        fontSize={0.6}
        color="#f59e0b"
        anchorX="center"
        rotation={textRotationVertical}
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {`${setbacks.left.toFixed(1)}m`}
      </Text>

      {/* 우측 이격거리 */}
      <Text
        position={[width / 2 - setbacks.right / 2, dimY + 0.3, 0]}
        fontSize={0.6}
        color="#f59e0b"
        anchorX="center"
        rotation={textRotationVertical}
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {`${setbacks.right.toFixed(1)}m`}
      </Text>

      {/* === 층별 북측 이격거리 (일조권) === */}
      {/* 북측 이격거리 라벨 (대지 바깥 오른쪽에 표시) */}
      {/* 카메라 회전으로 Z축이 반전됨: 낮은 Z = 화면 위쪽 */}
      {uniqueSetbacks.length > 0 ? (
        // 층별로 다른 이격거리를 리스트로 표시
        <group>
          {/* 배경 박스 - 층 수에 따라 크기 조정 */}
          <mesh
            position={[width / 2 + 6, dimY + 0.1, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[9, 2 + uniqueSetbacks.length * 1.2]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.85} />
          </mesh>
          {/* 제목 - 가장 위에 (낮은 Z = 화면 위쪽) */}
          <Text
            position={[width / 2 + 6, dimY + 0.3, -1 - uniqueSetbacks.length * 0.5]}
            fontSize={0.6}
            color="#ef4444"
            anchorX="center"
            rotation={textRotation}
            outlineWidth={0.03}
            outlineColor="#000"
          >
            북측 일조권 이격
          </Text>
          {/* 층별 이격거리 목록 - 제목 아래로 순차 배치 (Z 증가 = 화면 아래) */}
          {uniqueSetbacks.map((item, idx) => (
            <Text
              key={item.floor}
              position={[width / 2 + 6, dimY + 0.3, -uniqueSetbacks.length * 0.5 + idx * 1]}
              fontSize={0.45}
              color="#ffffff"
              anchorX="center"
              rotation={textRotation}
              outlineWidth={0.02}
              outlineColor="#000"
            >
              {`${item.floor}F~: ${item.setback.toFixed(1)}m → 깊이 ${item.buildingDepth.toFixed(1)}m`}
            </Text>
          ))}
        </group>
      ) : (
        // 단일 이격거리 표시
        <Text
          position={[width / 2 + 3, dimY + 0.3, depth / 2 - setbacks.back / 2]}
          fontSize={0.6}
          color="#ef4444"
          anchorX="left"
          rotation={textRotation}
          outlineWidth={0.03}
          outlineColor="#000"
        >
          {`북측 ${setbacks.back.toFixed(1)}m`}
        </Text>
      )}

      {/* === 건물 치수 === */}
      {/* 건물 가로 치수 */}
      <Text
        position={[buildingCenterX, dimY + 0.3, buildingFrontZ - 0.8]}
        fontSize={0.6}
        color="#3b82f6"
        anchorX="center"
        rotation={textRotation}
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {`건물 ${buildingWidth.toFixed(1)}m`}
      </Text>

      {/* 건물 세로 치수 */}
      <Text
        position={[buildingLeft - 0.8, dimY + 0.3, buildingCenterZ]}
        fontSize={0.6}
        color="#3b82f6"
        anchorX="center"
        rotation={textRotationVertical}
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {`${buildingDepth.toFixed(1)}m`}
      </Text>

      {/* 북쪽 방향 표시 (평면뷰용 - 화면 상단/북쪽에 표시) */}
      <group position={[0, dimY, depth / 2 + 3]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.8, 1.1, 32]} />
          <meshBasicMaterial color="#ef4444" side={THREE.DoubleSide} />
        </mesh>
        <Text
          fontSize={0.9}
          color="#ef4444"
          anchorX="center"
          anchorY="middle"
          position={[0, 0.2, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          outlineWidth={0.05}
          outlineColor="#fff"
        >
          N
        </Text>
        {/* 화살표 (북쪽 방향 - +Z 방향) */}
        <mesh position={[0, 0.1, 1.5]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.4, 1, 3]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
      </group>
    </group>
  )
}

// 방위 표시 (북쪽 방향 표시 - 양의 Z방향이 북쪽)
function CompassIndicator({ distance, landDepth }: { distance: number; landDepth: number }) {
  const northPosition = landDepth / 2 + 5 // 북쪽 대지경계선 바깥

  return (
    <group position={[distance * 0.5, 0.1, northPosition]}>
      {/* 북쪽 원형 표시 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[1.5, 2, 32]} />
        <meshStandardMaterial color="#ef4444" side={THREE.DoubleSide} />
      </mesh>

      {/* N 글자 */}
      <Text
        fontSize={2}
        color="#ef4444"
        anchorX="center"
        anchorY="middle"
        position={[0, 0.5, 0]}
        outlineWidth={0.1}
        outlineColor="#ffffff"
      >
        N
      </Text>

      {/* 화살표 (북쪽 방향 표시) */}
      <mesh position={[0, 0.3, -2]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.8, 2, 4]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>

      {/* 방향 라인 (건물 방향으로) */}
      <Line
        points={[[0, 0.1, 0], [0, 0.1, -5]]}
        color="#ef4444"
        lineWidth={3}
      />
    </group>
  )
}

// 북쪽 일조권 사선 제한 시각화 (건축법 시행령 제86조)
//
// 법 조문:
// 1. 높이 10미터 이하인 부분: 인접 대지경계선으로부터 1.5미터 이상
// 2. 높이 10미터를 초과하는 부분: 인접 대지경계선으로부터 해당 건축물 각 부분 높이의 2분의 1 이상
//
// 시각화:
// - 0~10m: 1.5m 이격 수직벽
// - 10m 높이에서: 5m 이격 (10÷2=5)
// - 10m~maxHeight: 사선 (높이의 1/2 이격)
// - 사선 비율: 1:2 (수평:수직)
function NorthSetbackEnvelope({
  landDimensions,
  maxHeight,
  useZone,
}: {
  landDimensions: { width: number; depth: number }
  maxHeight: number
  useZone?: string
}) {
  const { width, depth } = landDimensions
  const northBoundary = depth / 2 // 북쪽 대지경계선 (양의 Z방향)

  // 주거지역이 아니면 표시 안함
  if (useZone && !useZone.includes('주거')) {
    return null
  }

  // 10m 높이에서의 이격거리: 10/2 = 5m
  const setbackAt10m = 5
  // 최대 높이에서의 이격거리: maxHeight/2
  const maxSetback = getNorthSetbackAtHeight(maxHeight)

  // 한계선 평면 생성
  const envelopeGeometry = useMemo(() => {
    // 좌표 계산
    const z_1_5m = northBoundary - 1.5        // 0~10m: 1.5m 이격 위치
    const z_at_10m = northBoundary - setbackAt10m  // 10m 높이: 5m 이격
    const z_at_max = northBoundary - maxSetback    // 최대높이: H/2 이격

    const vertices = new Float32Array([
      // 수직 부분 (0m ~ 10m) - 1.5m 이격 벽
      // 삼각형 1
      -width / 2, 0, z_1_5m,
      width / 2, 0, z_1_5m,
      -width / 2, 10, z_1_5m,
      // 삼각형 2
      width / 2, 0, z_1_5m,
      width / 2, 10, z_1_5m,
      -width / 2, 10, z_1_5m,

      // 10m 높이에서 수평 연결 부분 (1.5m → 5m 이격)
      // 삼각형 1
      -width / 2, 10, z_1_5m,
      width / 2, 10, z_1_5m,
      -width / 2, 10, z_at_10m,
      // 삼각형 2
      width / 2, 10, z_1_5m,
      width / 2, 10, z_at_10m,
      -width / 2, 10, z_at_10m,

      // 사선 부분 (10m ~ maxHeight) - 높이의 1/2 이격
      // 삼각형 1
      -width / 2, 10, z_at_10m,
      width / 2, 10, z_at_10m,
      -width / 2, maxHeight, z_at_max,
      // 삼각형 2
      width / 2, 10, z_at_10m,
      width / 2, maxHeight, z_at_max,
      -width / 2, maxHeight, z_at_max,
    ])

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.computeVertexNormals()

    return geometry
  }, [width, northBoundary, maxHeight, maxSetback, setbackAt10m])

  return (
    <group>
      {/* 건물 한계 평면 (반투명) - 건물이 이 면을 넘으면 안됨 */}
      <mesh geometry={envelopeGeometry}>
        <meshStandardMaterial
          color="#ff4444"
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* === 건물 한계선 (실선) === */}
      {/* 좌측: 0m→10m(수직 1.5m) → 10m에서 연결 → 10m(5m이격) → maxHeight(사선) */}
      <Line
        points={[
          [-width / 2, 0, northBoundary - 1.5],
          [-width / 2, 10, northBoundary - 1.5],
          [-width / 2, 10, northBoundary - setbackAt10m],  // 10m에서 1.5m→5m 연결
          [-width / 2, maxHeight, northBoundary - maxSetback],
        ]}
        color="#ff0000"
        lineWidth={4}
      />

      {/* 우측 한계선 */}
      <Line
        points={[
          [width / 2, 0, northBoundary - 1.5],
          [width / 2, 10, northBoundary - 1.5],
          [width / 2, 10, northBoundary - setbackAt10m],  // 10m에서 1.5m→5m 연결
          [width / 2, maxHeight, northBoundary - maxSetback],
        ]}
        color="#ff0000"
        lineWidth={4}
      />

      {/* 상단 한계선 */}
      <Line
        points={[
          [-width / 2, maxHeight, northBoundary - maxSetback],
          [width / 2, maxHeight, northBoundary - maxSetback],
        ]}
        color="#ff0000"
        lineWidth={3}
      />

      {/* 지면 한계선 (1.5m 이격) */}
      <Line
        points={[
          [-width / 2, 0.05, northBoundary - 1.5],
          [width / 2, 0.05, northBoundary - 1.5],
        ]}
        color="#ff0000"
        lineWidth={3}
      />

      {/* 10m 높이에서의 연결선 (1.5m → 5m 이격) */}
      <Line
        points={[
          [-width / 2, 10, northBoundary - 1.5],
          [width / 2, 10, northBoundary - 1.5],
        ]}
        color="#ff0000"
        lineWidth={3}
      />
      <Line
        points={[
          [-width / 2, 10, northBoundary - 1.5],
          [-width / 2, 10, northBoundary - setbackAt10m],
        ]}
        color="#ff0000"
        lineWidth={3}
      />
      <Line
        points={[
          [width / 2, 10, northBoundary - 1.5],
          [width / 2, 10, northBoundary - setbackAt10m],
        ]}
        color="#ff0000"
        lineWidth={3}
      />
      <Line
        points={[
          [-width / 2, 10, northBoundary - setbackAt10m],
          [width / 2, 10, northBoundary - setbackAt10m],
        ]}
        color="#ff0000"
        lineWidth={3}
      />

      {/* === 사선 참고선 (점선) - 경계선에서 시작 === */}
      <Line
        points={[
          [-width / 2 - 1, 0, northBoundary],
          [-width / 2 - 1, maxHeight, northBoundary - maxSetback],
        ]}
        color="#ff6666"
        lineWidth={2}
        dashed
        dashSize={0.8}
        gapSize={0.4}
      />
      <Line
        points={[
          [width / 2 + 1, 0, northBoundary],
          [width / 2 + 1, maxHeight, northBoundary - maxSetback],
        ]}
        color="#ff6666"
        lineWidth={2}
        dashed
        dashSize={0.8}
        gapSize={0.4}
      />

      {/* === 정북 대지경계선 === */}
      <Line
        points={[
          [-width / 2 - 3, 0.1, northBoundary],
          [width / 2 + 3, 0.1, northBoundary],
        ]}
        color="#ff0000"
        lineWidth={4}
      />

      {/* 경계선에서 수직 기준선 */}
      <Line
        points={[
          [width / 2 + 2, 0, northBoundary],
          [width / 2 + 2, maxHeight, northBoundary],
        ]}
        color="#ff0000"
        lineWidth={2}
        dashed
        dashSize={0.5}
        gapSize={0.3}
      />

      {/* === 높이 기준선들 === */}
      {/* 10m 높이선 */}
      <Line
        points={[
          [-width / 2 - 2, 10, northBoundary],
          [width / 2 + 3, 10, northBoundary],
        ]}
        color="#ffaa00"
        lineWidth={2}
        dashed
        dashSize={1}
        gapSize={0.5}
      />

      {/* === 라벨들 === */}
      {/* 정북 경계선 라벨 */}
      <Text
        position={[width / 2 + 4, 1, northBoundary]}
        fontSize={1}
        color="#ff0000"
        anchorX="left"
        outlineWidth={0.05}
        outlineColor="#000"
      >
        정북 경계선
      </Text>

      {/* 10m 라벨 */}
      <Text
        position={[width / 2 + 4, 10, northBoundary]}
        fontSize={0.9}
        color="#ffaa00"
        anchorX="left"
        outlineWidth={0.04}
        outlineColor="#000"
      >
        10m (5m 이격)
      </Text>

      {/* 1.5m 이격 라벨 (0~10m 구간) */}
      <Text
        position={[0, 5, northBoundary - 0.75]}
        fontSize={0.8}
        color="#ff6666"
        anchorX="center"
        rotation={[-Math.PI / 2, 0, 0]}
        outlineWidth={0.03}
        outlineColor="#000"
      >
        1.5m 이격 (10m 이하)
      </Text>

      {/* 5m 이격 라벨 (10m 높이) */}
      <Text
        position={[0, 10.5, northBoundary - 2.5]}
        fontSize={0.8}
        color="#ff6666"
        anchorX="center"
        rotation={[-Math.PI / 2, 0, 0]}
        outlineWidth={0.03}
        outlineColor="#000"
      >
        5m 이격 (10m 초과)
      </Text>

      {/* 사선 비율 라벨 */}
      <Text
        position={[width / 2 + 3, (10 + maxHeight) / 2, (northBoundary - setbackAt10m + northBoundary - maxSetback) / 2]}
        fontSize={0.8}
        color="#ff6666"
        anchorX="left"
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {`H÷2 사선 (1:2)`}
      </Text>

      {/* 최대 높이에서의 이격거리 라벨 */}
      <Text
        position={[0, maxHeight + 1, northBoundary - maxSetback / 2]}
        fontSize={0.8}
        color="#ff0000"
        anchorX="center"
        rotation={[-Math.PI / 2, 0, 0]}
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {`${maxSetback.toFixed(1)}m 이격 (${maxHeight}m÷2)`}
      </Text>
    </group>
  )
}

// 그림자 평면 (일조 분석용)
function ShadowGround({ size }: { size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <planeGeometry args={[size * 2, size * 2]} />
      <shadowMaterial opacity={0.3} />
    </mesh>
  )
}

// 카메라 뷰 모드 타입
type ViewMode = 'perspective' | 'front' | 'top'

// 카메라 컨트롤러
function CameraController({ distance, viewMode, buildingHeight, landSize }: {
  distance: number
  viewMode: ViewMode
  buildingHeight: number
  landSize: number  // 대지 크기 (가로/세로 중 큰 값)
}) {
  const { camera, size } = useThree()

  useEffect(() => {
    const targetY = buildingHeight / 2

    switch (viewMode) {
      case 'front':
        // 정면 뷰 (도로방향/남쪽에서 건물을 바라봄, 북쪽을 향해)
        camera.up.set(0, 1, 0)  // 기본 up 벡터로 리셋
        camera.position.set(0, targetY, -distance * 1.8)
        camera.lookAt(0, targetY, 0)
        break
      case 'top':
        // 평면 뷰 - OrthographicCamera 컴포넌트에서 위치/회전 설정됨
        // 여기서는 줌만 조정
        if ((camera as any).isOrthographicCamera) {
          const orthoCamera = camera as THREE.OrthographicCamera
          const aspect = size.width / size.height
          const viewWidth = landSize * 1.5  // 대지 + 여백
          const viewHeight = viewWidth / aspect
          // 줌 계산: 화면 크기에 맞게
          const zoom = Math.min(size.width / viewWidth, size.height / viewHeight) * 0.4
          orthoCamera.zoom = zoom
          orthoCamera.updateProjectionMatrix()
        }
        break
      case 'perspective':
      default:
        // 조감 뷰 (기본 3D 뷰)
        camera.up.set(0, 1, 0)  // 기본 up 벡터로 리셋
        camera.position.set(distance * 1.2, distance * 0.8, distance * 1.2)
        camera.lookAt(0, targetY * 0.5, 0)
        break
    }
  }, [camera, distance, viewMode, buildingHeight, landSize, size])

  return null
}

// 자동 회전 (선택적)
function AutoRotate({ enabled = false }: { enabled?: boolean }) {
  const { camera } = useThree()
  const angleRef = useRef(0)

  useFrame((_, delta) => {
    if (!enabled) return
    angleRef.current += delta * 0.1
    const radius = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2)
    camera.position.x = Math.sin(angleRef.current) * radius
    camera.position.z = Math.cos(angleRef.current) * radius
    camera.lookAt(0, 10, 0)
  })

  return null
}

export function MassViewer3D({ building, landArea, useZone = '제2종일반주거지역', showNorthSetback = true, floorSetbacks }: MassViewer3DProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('perspective')
  const landDimensions = useMemo(() => calculateLandDimensions(landArea), [landArea])
  const buildingHeight = building.floors * building.floorHeight
  const viewDistance = useMemo(() => Math.max(landDimensions.width, landDimensions.depth, buildingHeight) * 1.5, [landDimensions, buildingHeight])

  // 건물 크기 계산 (1층 기준, 계단형 건물 고려)
  const buildingDimensions = useMemo(() => {
    // 1층 북측 이격거리 (계단형이면 첫번째 값 사용)
    const baseBackSetback = floorSetbacks && floorSetbacks.length > 0
      ? floorSetbacks[0]
      : building.setbacks.back

    // 건물 가용 영역 계산 (1층 기준)
    const availableWidth = landDimensions.width - building.setbacks.left - building.setbacks.right
    const availableDepth = landDimensions.depth - building.setbacks.front - baseBackSetback

    return {
      width: Math.max(3, availableWidth),
      depth: Math.max(1, availableDepth),
    }
  }, [landDimensions, building.setbacks, floorSetbacks])

  // 북쪽 일조권 계산
  const northSetbackRequired = useMemo(() => calculateNorthSetback(buildingHeight, useZone), [buildingHeight, useZone])

  // 자동 법규 적용 (floorSetbacks가 있으면 계단형 매스로 자동 적합)
  const isAutoSunlight = floorSetbacks && floorSetbacks.length > 0
  const isNorthSetbackOk = isAutoSunlight || building.setbacks.back >= northSetbackRequired

  // 평면 뷰에서는 일조권 사선 숨김
  const showSunlightEnvelope = showNorthSetback && viewMode !== 'top'

  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-800 to-gray-900">
      <Canvas shadows orthographic={viewMode === 'top'}>
        <CameraController distance={viewDistance} viewMode={viewMode} buildingHeight={buildingHeight} landSize={Math.max(landDimensions.width, landDimensions.depth)} />
        {viewMode === 'top' ? (
          <OrthographicCamera
            makeDefault
            position={[0, 100, 0]}
            rotation={[-Math.PI / 2, Math.PI, 0]}
            zoom={12}
            near={0.1}
            far={1000}
          />
        ) : (
          <PerspectiveCamera makeDefault fov={50} near={0.1} far={1000} />
        )}

        {/* 조명 */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[30, 50, 20]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={200}
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
        />
        <directionalLight position={[-20, 20, -20]} intensity={0.3} />

        {/* 환경 */}
        <Environment preset="city" />
        <fog attach="fog" args={['#1a1a2e', 50, 200]} />

        {/* 배경 그리드 */}
        <Grid
          position={[0, -0.1, 0]}
          args={[200, 200]}
          cellSize={2}
          cellThickness={0.5}
          cellColor="#333355"
          sectionSize={10}
          sectionThickness={1}
          sectionColor="#444477"
          fadeDistance={100}
          infiniteGrid
        />

        {/* 그림자 평면 */}
        <ShadowGround size={viewDistance} />

        {/* 대지 경계 */}
        <LandBoundary
          landDimensions={landDimensions}
          setbacks={building.setbacks}
          actualBackSetback={floorSetbacks && floorSetbacks.length > 0 ? floorSetbacks[0] : undefined}
        />

        {/* 건물 매스 (계단형 지원) */}
        <BuildingMass
          building={building}
          landDimensions={landDimensions}
          floorSetbacks={floorSetbacks}
          useZone={useZone}
        />

        {/* 북쪽 일조권 사선 제한 (평면뷰에서는 숨김) */}
        {showSunlightEnvelope && (
          <NorthSetbackEnvelope
            landDimensions={landDimensions}
            maxHeight={buildingHeight + 10}
            useZone={useZone}
          />
        )}

        {/* 평면 뷰 치수 표시 */}
        {viewMode === 'top' && (
          <PlanViewDimensions
            landDimensions={landDimensions}
            setbacks={{
              ...building.setbacks,
              back: floorSetbacks && floorSetbacks.length > 0 ? floorSetbacks[0] : building.setbacks.back,
            }}
            buildingWidth={buildingDimensions.width}
            buildingDepth={buildingDimensions.depth}
            floorSetbacks={floorSetbacks}
            floorHeight={building.floorHeight}
          />
        )}

        {/* 방위 표시 (북쪽 = +Z 방향) - 평면뷰에서는 숨김 (PlanViewDimensions에서 별도 표시) */}
        {viewMode !== 'top' && (
          <CompassIndicator distance={viewDistance} landDepth={landDimensions.depth} />
        )}

        {/* 카메라 컨트롤 */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={10}
          maxDistance={200}
          maxPolarAngle={viewMode === 'top' ? 0 : Math.PI / 2.1}
          minPolarAngle={viewMode === 'top' ? 0 : 0}
          enableRotate={viewMode !== 'top'}
          target={viewMode === 'top' ? [0, 0, 0] : [0, building.floors * building.floorHeight / 3, 0]}
        />

        {/* 자동 회전 (비활성화) */}
        <AutoRotate enabled={false} />
      </Canvas>

      {/* 북쪽 방향 인디케이터 (좌상단) */}
      <div className="absolute top-4 left-4 bg-gray-800/90 backdrop-blur rounded-lg p-3">
        <div className="flex items-center gap-3">
          {/* 나침반 아이콘 */}
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-gray-600"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center">
                <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-red-500"></div>
                <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-gray-400 -mt-1"></div>
              </div>
            </div>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-red-500 text-xs font-bold">N</div>
          </div>

          <div className="text-xs">
            <div className="text-gray-400 mb-1">북측 일조권</div>
            <div className={`font-bold ${isNorthSetbackOk ? 'text-green-400' : 'text-red-400'}`}>
              {isNorthSetbackOk ? '✓ 적합' : '✗ 부적합'}
            </div>
            {isAutoSunlight ? (
              <div className="text-blue-400 mt-1 text-[10px]">
                자동 법규 적용 중
              </div>
            ) : (
              <>
                <div className="text-gray-500 mt-1">
                  필요: {northSetbackRequired.toFixed(1)}m
                </div>
                <div className="text-gray-500">
                  현재: {building.setbacks.back}m
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 뷰 컨트롤 버튼 */}
      <div className="absolute bottom-4 left-4 flex gap-2">
        <button
          onClick={() => setViewMode('front')}
          className={`px-3 py-2 rounded-lg text-sm backdrop-blur transition-colors ${
            viewMode === 'front'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700/80 hover:bg-gray-600 text-white'
          }`}
        >
          정면
        </button>
        <button
          onClick={() => setViewMode('top')}
          className={`px-3 py-2 rounded-lg text-sm backdrop-blur transition-colors ${
            viewMode === 'top'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700/80 hover:bg-gray-600 text-white'
          }`}
        >
          평면
        </button>
        <button
          onClick={() => setViewMode('perspective')}
          className={`px-3 py-2 rounded-lg text-sm backdrop-blur transition-colors ${
            viewMode === 'perspective'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700/80 hover:bg-gray-600 text-white'
          }`}
        >
          조감
        </button>
      </div>

      {/* 범례 */}
      <div className="absolute bottom-4 right-4 bg-gray-800/90 backdrop-blur rounded-lg p-3 text-xs">
        <div className="text-gray-400 text-[10px] mb-2 font-medium">대지</div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
          <span className="text-gray-300">대지 경계</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>
          <span className="text-gray-300">이격거리</span>
        </div>
        <div className="text-gray-400 text-[10px] mb-2 font-medium">건물 용도</div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-gray-500 rounded-sm"></div>
          <span className="text-gray-300">1층 상가</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
          <span className="text-gray-300">주거</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
          <span className="text-gray-300">옥탑</span>
        </div>
        {showNorthSetback && (
          <>
            <div className="text-gray-400 text-[10px] mb-2 font-medium border-t border-gray-700 pt-2">일조권</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-400/50 rounded-sm"></div>
              <span className="text-gray-300">북측 사선제한</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
