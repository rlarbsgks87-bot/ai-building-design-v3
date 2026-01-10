'use client'

import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, Text, Environment, Line, PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import * as THREE from 'three'
import { downloadOBJ, downloadDXF, downloadSTEP } from '@/lib/exportModel'

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

interface AdjacentRoad {
  pnu: string
  geometry: [number, number][]  // [lng, lat][] 폴리곤 좌표
  jimok: string
  direction: 'north' | 'south' | 'east' | 'west' | 'unknown'
  center: { lng: number; lat: number }
}

interface KakaoRoad {
  direction: 'north' | 'south' | 'east' | 'west'
  road_name: string  // 도로명 (예: '연북로')
  road_address: string  // 전체 도로명 주소
}

interface MassViewer3DProps {
  building: BuildingConfig
  landArea: number
  landDimensions?: { width: number; depth: number }  // VWorld에서 가져온 실제 필지 크기
  landPolygon?: [number, number][]  // [lng, lat][] 지적도 폴리곤 좌표
  adjacentRoads?: AdjacentRoad[]  // 인접 도로 데이터 (지적도 기반)
  kakaoRoads?: KakaoRoad[]  // 도로명 정보 (Kakao API fallback)
  useZone?: string  // 용도지역 (주거지역인 경우 일조권 적용)
  showNorthSetback?: boolean  // 북쪽 일조권 표시 여부
  floorSetbacks?: number[]  // 층별 북측 이격거리 (계단형 매스용)
  address?: string  // 주소 (내보내기시 메타데이터용)
}

// WGS84 좌표를 로컬 미터 좌표로 변환 (폴리곤 중심 기준)
function convertPolygonToLocal(polygon: [number, number][]): { points: [number, number][]; center: [number, number] } {
  if (!polygon || polygon.length < 3) {
    return { points: [], center: [0, 0] }
  }

  // 중심점 계산
  let sumLng = 0, sumLat = 0
  for (const [lng, lat] of polygon) {
    sumLng += lng
    sumLat += lat
  }
  const centerLng = sumLng / polygon.length
  const centerLat = sumLat / polygon.length

  // WGS84 → 미터 변환 (제주도 위도 기준)
  // 1도 위도 ≈ 111,320m
  // 1도 경도 ≈ 111,320 × cos(위도) m
  const metersPerDegreeLat = 111320
  const metersPerDegreeLng = 111320 * Math.cos(centerLat * Math.PI / 180)

  // 폴리곤 좌표를 로컬 미터로 변환 (중심 기준)
  const points: [number, number][] = polygon.map(([lng, lat]) => {
    const x = (lng - centerLng) * metersPerDegreeLng
    const z = (lat - centerLat) * metersPerDegreeLat
    return [x, z]
  })

  return { points, center: [centerLng, centerLat] }
}

// 폴리곤 면적 계산 (Shoelace formula) - 양수면 반시계, 음수면 시계방향
function getPolygonArea(points: [number, number][]): number {
  let area = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i][0] * points[j][1]
    area -= points[j][0] * points[i][1]
  }
  return area / 2
}

// 폴리곤 내부 축소 (Polygon Offset) - 단일 이격거리 적용
function offsetPolygon(points: [number, number][], offset: number): [number, number][] {
  return offsetPolygonDirectional(points, { front: offset, back: offset, left: offset, right: offset })
}

// 방향별 이격거리를 적용하는 폴리곤 축소
// setbacks: { front(남쪽/-Z), back(북쪽/+Z), left(-X), right(+X) }
function offsetPolygonDirectional(
  points: [number, number][],
  setbacks: { front: number; back: number; left: number; right: number }
): [number, number][] {
  if (points.length < 3) return points

  const result: [number, number][] = []
  const n = points.length

  // 폴리곤 방향 확인
  const area = getPolygonArea(points)
  const direction = area >= 0 ? 1 : -1

  // 폴리곤 중심 계산
  let sumX = 0, sumZ = 0
  for (const [x, z] of points) { sumX += x; sumZ += z }
  const centerX = sumX / n
  const centerZ = sumZ / n

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const curr = points[i]
    const next = points[(i + 1) % n]

    // 현재 점에서 이전/다음 점으로의 벡터
    const v1 = [curr[0] - prev[0], curr[1] - prev[1]]
    const v2 = [next[0] - curr[0], next[1] - curr[1]]

    const len1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1])
    const len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1])
    if (len1 === 0 || len2 === 0) continue

    // 법선 벡터
    const n1 = [direction * v1[1] / len1, -direction * v1[0] / len1]
    const n2 = [direction * v2[1] / len2, -direction * v2[0] / len2]

    // 평균 법선
    const avgNx = (n1[0] + n2[0]) / 2
    const avgNy = (n1[1] + n2[1]) / 2
    const avgLen = Math.sqrt(avgNx * avgNx + avgNy * avgNy)

    if (avgLen > 0) {
      const scale = 1 / Math.max(avgLen, 0.5)

      // 현재 점이 폴리곤 중심 기준 어느 방향에 있는지 판단하여 이격거리 결정
      const relX = curr[0] - centerX
      const relZ = curr[1] - centerZ

      // 방향별 이격거리 선택 (주요 방향 기준)
      let offset: number
      if (Math.abs(relZ) > Math.abs(relX)) {
        // Z 방향이 더 멀면 (북쪽/남쪽)
        offset = relZ > 0 ? setbacks.back : setbacks.front
      } else {
        // X 방향이 더 멀면 (동쪽/서쪽)
        offset = relX > 0 ? setbacks.right : setbacks.left
      }

      result.push([
        curr[0] - avgNx * scale * offset,
        curr[1] - avgNy * scale * offset
      ])
    } else {
      result.push(curr)
    }
  }

  return result
}

// 폴리곤 내 최대 내접 사각형 계산 (근사)
function getMaxInscribedRect(points: [number, number][]): {
  centerX: number
  centerZ: number
  width: number
  depth: number
} {
  if (points.length < 3) {
    return { centerX: 0, centerZ: 0, width: 10, depth: 10 }
  }

  // 폴리곤 중심 계산
  let sumX = 0, sumZ = 0
  for (const [x, z] of points) {
    sumX += x
    sumZ += z
  }
  const centerX = sumX / points.length
  const centerZ = sumZ / points.length

  // 중심에서 각 방향으로 경계까지 거리 측정 (Ray Casting)
  const directions = [
    [1, 0],   // 동쪽 (+X)
    [-1, 0],  // 서쪽 (-X)
    [0, 1],   // 북쪽 (+Z)
    [0, -1],  // 남쪽 (-Z)
  ]

  const distances: number[] = []

  for (const [dx, dz] of directions) {
    let minDist = Infinity

    // 각 변과의 교차점 찾기
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i]
      const p2 = points[(i + 1) % points.length]

      // 광선과 선분의 교차 계산
      const dist = raySegmentIntersect(centerX, centerZ, dx, dz, p1, p2)
      if (dist !== null && dist > 0 && dist < minDist) {
        minDist = dist
      }
    }

    distances.push(minDist === Infinity ? 50 : minDist)
  }

  // 동서남북 거리로 사각형 크기 결정
  const width = Math.min(distances[0], distances[1]) * 2  // 좌우 중 작은 값 * 2
  const depth = Math.min(distances[2], distances[3]) * 2  // 상하 중 작은 값 * 2

  return { centerX, centerZ, width, depth }
}

// 광선-선분 교차 계산
function raySegmentIntersect(
  ox: number, oz: number,  // 광선 원점
  dx: number, dz: number,  // 광선 방향
  p1: [number, number],    // 선분 시작점
  p2: [number, number]     // 선분 끝점
): number | null {
  const x1 = p1[0], z1 = p1[1]
  const x2 = p2[0], z2 = p2[1]

  const denominator = dx * (z2 - z1) - dz * (x2 - x1)
  if (Math.abs(denominator) < 0.0001) return null

  const t = ((x1 - ox) * (z2 - z1) - (z1 - oz) * (x2 - x1)) / denominator
  const u = ((x1 - ox) * dz - (z1 - oz) * dx) / denominator

  if (t >= 0 && u >= 0 && u <= 1) {
    return t
  }

  return null
}

// 대지 크기 계산 (실제 dimensions가 있으면 사용, 없으면 정사각형 가정)
function calculateLandDimensions(area: number, dimensions?: { width: number; depth: number }) {
  if (dimensions && dimensions.width > 0 && dimensions.depth > 0) {
    // 실제 필지 형상 사용
    return { width: dimensions.width, depth: dimensions.depth }
  }
  // 정사각형 근사 (fallback)
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
function BuildingMass({ building, landDimensions, landPolygon, floorSetbacks, useZone }: {
  building: BuildingConfig
  landDimensions: { width: number; depth: number }
  landPolygon?: [number, number][]  // [lng, lat][] 지적도 폴리곤 좌표
  floorSetbacks?: number[]  // 층별 북측 이격거리
  useZone?: string
}) {
  const { width: landWidth, depth: landDepth } = landDimensions

  // 계단형 여부 확인
  const isSteppedBuilding = floorSetbacks && floorSetbacks.length > 0

  // 1층 기준 북측 이격거리 (계단형이면 첫번째 값 사용)
  // 건축법 시행령 제86조: 10m 이하 1.5m, 10m 초과 높이/2
  const baseBackSetback = isSteppedBuilding && floorSetbacks && floorSetbacks[0]
    ? floorSetbacks[0]
    : building.setbacks.back

  // 방향별 이격거리 (북쪽은 일조권 기준)
  const directionalSetbacks = useMemo(() => ({
    front: building.setbacks.front,
    back: baseBackSetback,  // 북쪽: 일조권 이격 (높이/2)
    left: building.setbacks.left,
    right: building.setbacks.right,
  }), [building.setbacks, baseBackSetback])

  // 폴리곤 좌표를 로컬 좌표로 변환 후 방향별 이격거리 적용
  const buildableArea = useMemo(() => {
    if (landPolygon && landPolygon.length >= 3) {
      const localPolygon = convertPolygonToLocal(landPolygon)
      if (localPolygon.points.length >= 3) {
        // 방향별 이격거리 적용된 내부 폴리곤 (북쪽은 일조권 이격)
        const shrunkPolygon = offsetPolygonDirectional(localPolygon.points, directionalSetbacks)
        // 최대 내접 사각형 계산
        return getMaxInscribedRect(shrunkPolygon)
      }
    }
    return null
  }, [landPolygon, directionalSetbacks])

  // 건물 가용 영역 계산 (폴리곤 기반 또는 bounding box 기반)
  const availableWidth = buildableArea
    ? buildableArea.width
    : landWidth - building.setbacks.left - building.setbacks.right
  const availableDepth = buildableArea
    ? buildableArea.depth
    : landDepth - building.setbacks.front - baseBackSetback
  const rawBuildingArea = availableWidth * availableDepth

  // 건물 크기를 실제 buildingArea에 맞게 조정 (법정 한도 반영)
  // buildingArea가 rawBuildingArea보다 작으면 비율에 맞게 축소
  const areaRatio = building.buildingArea > 0 && rawBuildingArea > 0
    ? Math.sqrt(building.buildingArea / rawBuildingArea)
    : 1

  // 건물 너비/깊이에 비율 적용
  const buildingWidth = Math.max(3, availableWidth * areaRatio)

  // 건물 높이 계산
  const buildingHeight = building.floors * building.floorHeight

  // 건물 중심 위치 계산 (폴리곤 기반 또는 bounding box 기반)
  const centerX = buildableArea
    ? buildableArea.centerX
    : (building.setbacks.left - building.setbacks.right) / 2
  // Z: 전면 이격거리부터 시작해서 가용 깊이의 중앙 (북쪽이 +Z)
  const baseCenterZ = buildableArea
    ? buildableArea.centerZ
    : -landDepth / 2 + building.setbacks.front + availableDepth / 2

  // 층별 데이터 생성 (계단형 매스)
  const floors = useMemo(() => {
    const result = []
    const hasRooftop = building.floors >= 3
    const isResidential = useZone?.includes('주거')

    for (let i = 0; i < building.floors; i++) {
      const floorNum = i + 1
      const floorTopHeight = floorNum * building.floorHeight

      // 해당 층의 북측 이격거리 (계단형이 아닌 경우에만 층별 변동)
      let backSetback = baseBackSetback
      if (isSteppedBuilding && floorSetbacks && floorSetbacks[i] !== undefined) {
        backSetback = floorSetbacks[i]
      } else if (isResidential && !buildableArea) {
        // 폴리곤 기반이 아닐 때만 층별 일조권 적용
        backSetback = getNorthSetbackAtHeight(floorTopHeight, building.setbacks.back)
      }

      // 해당 층의 깊이 계산
      let floorDepth: number
      let floorCenterZ: number

      if (buildableArea) {
        // 폴리곤 기반: 내접 사각형 기준으로 계산
        // 계단형일 때 상층부 축소 반영
        const depthReduction = isSteppedBuilding && backSetback > baseBackSetback
          ? (backSetback - baseBackSetback)
          : 0
        floorDepth = Math.max(1, (availableDepth - depthReduction) * areaRatio)
        // 중심 위치: 축소된 만큼 남쪽(-)으로 이동
        floorCenterZ = baseCenterZ - depthReduction / 2
      } else {
        // bounding box 기반
        const floorAvailableDepth = landDepth - building.setbacks.front - backSetback
        floorDepth = Math.max(1, floorAvailableDepth * areaRatio)
        // 이 층의 중심 Z 위치
        const floorStartZ = -landDepth / 2 + building.setbacks.front
        floorCenterZ = floorStartZ + floorDepth / 2
      }

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
  }, [building, buildingWidth, floorSetbacks, landDepth, useZone, isSteppedBuilding, baseBackSetback, areaRatio, buildableArea, availableDepth, baseCenterZ])

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

// 도로 폴리곤 컴포넌트 (지적도 기반)
function RoadPolygon({
  road,
  landCenter,
}: {
  road: AdjacentRoad
  landCenter: [number, number]  // [lng, lat] 대지 중심점
}) {
  // 도로 폴리곤을 대지 중심 기준 로컬 좌표로 변환
  const { roadShape, boundaryPoints, labelPosition, directionLabel } = useMemo(() => {
    if (!road.geometry || road.geometry.length < 3) {
      return { roadShape: null, boundaryPoints: [], labelPosition: [0, 0, 0], directionLabel: '' }
    }

    const centerLng = landCenter[0]
    const centerLat = landCenter[1]

    // WGS84 → 미터 변환
    const metersPerDegreeLat = 111320
    const metersPerDegreeLng = 111320 * Math.cos(centerLat * Math.PI / 180)

    // 폴리곤 좌표 변환
    const localPoints: [number, number][] = road.geometry.map(([lng, lat]) => {
      const x = (lng - centerLng) * metersPerDegreeLng
      const z = (lat - centerLat) * metersPerDegreeLat
      return [x, z]
    })

    // Three.js Shape 생성 (XY 평면 → XZ 평면으로 회전)
    const shape = new THREE.Shape()
    shape.moveTo(localPoints[0][0], -localPoints[0][1])  // Y좌표 음수로 (회전 대비)
    for (let i = 1; i < localPoints.length; i++) {
      shape.lineTo(localPoints[i][0], -localPoints[i][1])
    }
    shape.closePath()

    // 경계선 포인트
    const boundaryPts: [number, number, number][] = localPoints.map(([x, z]) => [x, 0.02, z])
    if (boundaryPts.length > 0) {
      boundaryPts.push([...boundaryPts[0]])
    }

    // 라벨 위치 (도로 중심)
    const roadCenterX = (road.center.lng - centerLng) * metersPerDegreeLng
    const roadCenterZ = (road.center.lat - centerLat) * metersPerDegreeLat

    // 방향 라벨
    const dirLabel = road.direction === 'north' ? '북측 도로' :
                     road.direction === 'south' ? '남측 도로' :
                     road.direction === 'east' ? '동측 도로' :
                     road.direction === 'west' ? '서측 도로' : '도로'

    return {
      roadShape: shape,
      boundaryPoints: boundaryPts,
      labelPosition: [roadCenterX, 0.5, roadCenterZ] as [number, number, number],
      directionLabel: dirLabel,
    }
  }, [road, landCenter])

  if (!roadShape) return null

  return (
    <group>
      {/* 도로 폴리곤 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <shapeGeometry args={[roadShape]} />
        <meshStandardMaterial color="#4a5568" side={THREE.DoubleSide} />
      </mesh>

      {/* 도로 경계선 */}
      <Line
        points={boundaryPoints}
        color="#9ca3af"
        lineWidth={2}
      />

      {/* 도로 라벨 */}
      <Text
        position={labelPosition}
        fontSize={1.0}
        color="#ffffff"
        anchorX="center"
        rotation={[-Math.PI / 2, 0, 0]}
        outlineWidth={0.05}
        outlineColor="#000000"
      >
        {directionLabel}
      </Text>
    </group>
  )
}

// 대지 경계 및 이격선
function LandBoundary({
  landDimensions,
  landPolygon,
  adjacentRoads,
  kakaoRoads,
  setbacks,
  actualBackSetback,
}: {
  landDimensions: { width: number; depth: number }
  landPolygon?: [number, number][]  // [lng, lat][] 지적도 폴리곤 좌표
  adjacentRoads?: AdjacentRoad[]  // 인접 도로 데이터
  kakaoRoads?: KakaoRoad[]  // 도로명 정보 (Kakao fallback)
  setbacks: BuildingConfig['setbacks']
  actualBackSetback?: number  // 실제 1층 북측 이격거리 (floorSetbacks[0])
}) {
  const { width, depth } = landDimensions

  // 실제 표시할 이격거리 (계단형이면 1층 기준, 북쪽은 일조권 이격)
  const displaySetbacks = {
    ...setbacks,
    back: actualBackSetback ?? setbacks.back,
  }

  // 폴리곤 좌표를 로컬 좌표로 변환
  const localPolygon = useMemo(() => {
    if (landPolygon && landPolygon.length >= 3) {
      return convertPolygonToLocal(landPolygon)
    }
    return null
  }, [landPolygon])

  // 방향별 이격거리 적용된 내부 폴리곤 (북쪽은 일조권 이격)
  const offsetPolygonPoints = useMemo(() => {
    if (localPolygon && localPolygon.points.length >= 3) {
      return offsetPolygonDirectional(localPolygon.points, displaySetbacks)
    }
    return null
  }, [localPolygon, displaySetbacks])

  // 폴리곤 Shape 생성 (Three.js용)
  // 주의: Shape는 XY 평면에서 생성 후 -90도 회전하여 XZ 평면에 배치
  // 회전 시 Y → -Z 변환되므로, Shape의 Y좌표를 음수로 설정해야 올바른 위치에 렌더링됨
  const landShape = useMemo(() => {
    if (localPolygon && localPolygon.points.length >= 3) {
      const shape = new THREE.Shape()
      const pts = localPolygon.points
      // Y좌표(=z)를 음수로 변환하여 회전 후 올바른 위치에 배치
      shape.moveTo(pts[0][0], -pts[0][1])
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i][0], -pts[i][1])
      }
      shape.closePath()
      return shape
    }
    return null
  }, [localPolygon])

  // 폴리곤 경계선 포인트 (3D Line용)
  const boundaryPoints: [number, number, number][] = useMemo(() => {
    if (localPolygon && localPolygon.points.length >= 3) {
      const pts = localPolygon.points.map(([x, z]) => [x, 0.01, z] as [number, number, number])
      // 폐합을 위해 첫 점 추가
      if (pts.length > 0) {
        pts.push([...pts[0]])
      }
      return pts
    }
    // fallback: 사각형
    return [
      [-width / 2, 0.01, -depth / 2],
      [width / 2, 0.01, -depth / 2],
      [width / 2, 0.01, depth / 2],
      [-width / 2, 0.01, depth / 2],
      [-width / 2, 0.01, -depth / 2],
    ]
  }, [localPolygon, width, depth])

  // 이격선 포인트 (폴리곤 형상을 따름)
  const setbackLinePoints: [number, number, number][] = useMemo(() => {
    if (offsetPolygonPoints && offsetPolygonPoints.length >= 3) {
      const pts = offsetPolygonPoints.map(([x, z]) => [x, 0.03, z] as [number, number, number])
      if (pts.length > 0) {
        pts.push([...pts[0]])
      }
      return pts
    }
    // fallback: 사각형 (bounding box 기준)
    return [
      [-width / 2 + displaySetbacks.left, 0.03, -depth / 2 + displaySetbacks.front],
      [width / 2 - displaySetbacks.right, 0.03, -depth / 2 + displaySetbacks.front],
      [width / 2 - displaySetbacks.right, 0.03, depth / 2 - displaySetbacks.back],
      [-width / 2 + displaySetbacks.left, 0.03, depth / 2 - displaySetbacks.back],
      [-width / 2 + displaySetbacks.left, 0.03, -depth / 2 + displaySetbacks.front],
    ]
  }, [offsetPolygonPoints, width, depth, displaySetbacks])

  // 모서리 포인트
  const cornerPoints: [number, number, number][] = useMemo(() => {
    if (localPolygon && localPolygon.points.length >= 3) {
      return localPolygon.points.map(([x, z]) => [x, 0.02, z] as [number, number, number])
    }
    return [
      [-width / 2, 0.02, -depth / 2],
      [width / 2, 0.02, -depth / 2],
      [width / 2, 0.02, depth / 2],
      [-width / 2, 0.02, depth / 2],
    ]
  }, [localPolygon, width, depth])

  return (
    <group>
      {/* 대지 바닥 - 폴리곤 또는 사각형 */}
      {landShape ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <shapeGeometry args={[landShape]} />
          <meshStandardMaterial color="#1a472a" side={THREE.DoubleSide} />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial color="#1a472a" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* 대지 경계선 */}
      <Line
        points={boundaryPoints}
        color="#22c55e"
        lineWidth={3}
      />

      {/* 이격거리 표시 - 폴리곤 형상을 따르는 내부 경계선 */}
      <Line
        points={setbackLinePoints}
        color="#f59e0b"
        lineWidth={2}
        dashed
        dashSize={0.5}
        gapSize={0.3}
      />

      {/* 이격거리 라벨 */}
      <Text
        position={[0, 0.5, -depth / 2 + displaySetbacks.front / 2]}
        fontSize={0.8}
        color="#f59e0b"
        anchorX="center"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {`전면 ${displaySetbacks.front}m`}
      </Text>
      <Text
        position={[0, 0.5, depth / 2 - displaySetbacks.back / 2]}
        fontSize={0.8}
        color="#f59e0b"
        anchorX="center"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {`북측 ${displaySetbacks.back}m`}
      </Text>

      {/* 인접 도로 표시 (지적도 데이터 또는 fallback) */}
      {adjacentRoads && adjacentRoads.length > 0 && localPolygon ? (
        // 실제 지적도 도로 데이터 렌더링
        adjacentRoads.map((road, idx) => (
          <RoadPolygon
            key={road.pnu || idx}
            road={road}
            landCenter={localPolygon.center}
          />
        ))
      ) : (
        // Fallback: 카카오 API 기반 도로 방향에 따라 동적 배치 + 필지 형상 기반 회전
        (() => {
          // 도로 방향 결정 (카카오 API 기반, 기본값: south)
          const roadDirection = kakaoRoads?.[0]?.direction || 'south'
          const roadName = kakaoRoads?.[0]?.road_name || '도로'
          const isNorth = roadDirection === 'north'

          // 필지 폴리곤에서 도로 접합 변의 각도 계산
          let roadRotation = 0 // Y축 회전 (라디안)
          let roadCenterX = 0
          let roadCenterZ = isNorth ? depth / 2 + 4 : -depth / 2 - 4

          if (localPolygon && localPolygon.points.length >= 3) {
            // 각 변의 중심 Z 좌표를 계산하여 가장 북쪽/남쪽 변 찾기
            const edges = localPolygon.points.map((p, i) => {
              const next = localPolygon.points[(i + 1) % localPolygon.points.length]
              const midZ = (p[1] + next[1]) / 2  // Z = 위도 방향
              const midX = (p[0] + next[0]) / 2
              const dx = next[0] - p[0]
              const dz = next[1] - p[1]
              const angle = Math.atan2(dz, dx)
              return { midZ, midX, angle, length: Math.sqrt(dx*dx + dz*dz) }
            })

            // 도로 방향에 따라 가장 북쪽 또는 남쪽 변 선택
            const targetEdge = isNorth
              ? edges.reduce((max, e) => e.midZ > max.midZ ? e : max, edges[0])
              : edges.reduce((min, e) => e.midZ < min.midZ ? e : min, edges[0])

            roadRotation = -targetEdge.angle // Three.js Y축 회전
            roadCenterX = targetEdge.midX
            roadCenterZ = targetEdge.midZ + (isNorth ? 4 : -4)
          }

          // 도로 길이 (필지 너비 + 여유)
          const roadLength = width + 10

          return (
            <group
              position={[roadCenterX, 0, roadCenterZ]}
              rotation={[0, roadRotation, 0]}
            >
              {/* 도로 평면 */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
                <planeGeometry args={[roadLength, 8]} />
                <meshStandardMaterial color="#4a5568" side={THREE.DoubleSide} />
              </mesh>

              {/* 도로 중앙선 (흰색 점선) */}
              <Line
                points={[
                  [-roadLength / 2, 0.01, 0],
                  [roadLength / 2, 0.01, 0],
                ]}
                color="#ffffff"
                lineWidth={2}
                dashed
                dashSize={1.5}
                gapSize={1}
              />

              {/* 도로 경계선 (대지측) */}
              <Line
                points={[
                  [-roadLength / 2, 0.02, isNorth ? -4 : 4],
                  [roadLength / 2, 0.02, isNorth ? -4 : 4],
                ]}
                color="#9ca3af"
                lineWidth={2}
              />

              {/* 도로 라벨 */}
              <Text
                position={[0, 0.5, 0]}
                fontSize={1.2}
                color="#ffffff"
                anchorX="center"
                rotation={[-Math.PI / 2, 0, 0]}
                outlineWidth={0.05}
                outlineColor="#000000"
              >
                {roadName}
              </Text>

              {/* 도로 방향 표시 (북측/남측) */}
              <Text
                position={[roadLength / 2 - 2, 0.5, 0]}
                fontSize={0.8}
                color="#fbbf24"
                anchorX="left"
                rotation={[-Math.PI / 2, 0, 0]}
                outlineWidth={0.03}
                outlineColor="#000000"
              >
                {isNorth ? '(북측)' : '(남측)'}
              </Text>

              {/* 도로 방향 화살표 (양방향 통행) */}
              <Text
                position={[-roadLength / 2 + 1, 0.5, 0]}
                fontSize={1}
                color="#ffffff"
                anchorX="center"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                ←
              </Text>
              <Text
                position={[roadLength / 2 - 1, 0.5, 0]}
                fontSize={1}
                color="#ffffff"
                anchorX="center"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                →
              </Text>
            </group>
          )
        })()
      )}

      {/* 대지 모서리 포인트 */}
      {cornerPoints.map((pos, i) => (
        <mesh key={i} position={pos}>
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

export function MassViewer3D({ building, landArea, landDimensions: propLandDimensions, landPolygon, adjacentRoads, kakaoRoads, useZone = '제2종일반주거지역', showNorthSetback = true, floorSetbacks, address }: MassViewer3DProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('perspective')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const landDimensions = useMemo(() => calculateLandDimensions(landArea, propLandDimensions), [landArea, propLandDimensions])
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
          landPolygon={landPolygon}
          adjacentRoads={adjacentRoads}
          kakaoRoads={kakaoRoads}
          setbacks={building.setbacks}
          actualBackSetback={floorSetbacks && floorSetbacks.length > 0 ? floorSetbacks[0] : undefined}
        />

        {/* 건물 매스 (계단형 지원) - 폴리곤 기반 배치 */}
        <BuildingMass
          building={building}
          landDimensions={landDimensions}
          landPolygon={landPolygon}
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

      {/* 뷰 컨트롤 버튼 + 내보내기 */}
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

        {/* 구분선 */}
        <div className="w-px bg-gray-600 mx-1"></div>

        {/* 내보내기 버튼 */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            내보내기
          </button>

          {showExportMenu && (
            <div className="absolute left-0 bottom-full mb-2 w-52 bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden z-50">
              <div className="px-3 py-2 bg-gray-700/50 border-b border-gray-700">
                <span className="text-xs text-gray-400 font-medium">3D 모델 다운로드</span>
              </div>
              <button
                onClick={() => {
                  downloadOBJ(building, landArea, propLandDimensions, floorSetbacks, useZone, address, building.name)
                  setShowExportMenu(false)
                }}
                className="w-full px-4 py-3 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-3"
              >
                <span className="text-lg">📦</span>
                <div>
                  <div className="font-medium">OBJ 형식</div>
                  <div className="text-xs text-gray-400">라이노, 3ds Max</div>
                </div>
              </button>
              <button
                onClick={() => {
                  downloadDXF(building, landArea, propLandDimensions, floorSetbacks, useZone, address, building.name)
                  setShowExportMenu(false)
                }}
                className="w-full px-4 py-3 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-3 border-t border-gray-700"
              >
                <span className="text-lg">📐</span>
                <div>
                  <div className="font-medium">DXF 형식</div>
                  <div className="text-xs text-gray-400">AutoCAD</div>
                </div>
              </button>
              <button
                onClick={() => {
                  downloadSTEP(building, landArea, propLandDimensions, floorSetbacks, useZone, address, building.name)
                  setShowExportMenu(false)
                }}
                className="w-full px-4 py-3 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-3 border-t border-gray-700"
              >
                <span className="text-lg">🔧</span>
                <div>
                  <div className="font-medium">STEP 형식</div>
                  <div className="text-xs text-gray-400">SolidWorks, CATIA</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 메뉴 외부 클릭시 닫기 */}
      {showExportMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowExportMenu(false)}
        />
      )}

      {/* 범례 */}
      <div className="absolute bottom-4 right-4 bg-gray-800/90 backdrop-blur rounded-lg p-3 text-xs">
        <div className="text-gray-400 text-[10px] mb-2 font-medium">대지</div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
          <span className="text-gray-300">대지 경계</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>
          <span className="text-gray-300">이격거리</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 bg-gray-500 rounded-sm"></div>
          <span className="text-gray-300">도로</span>
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
