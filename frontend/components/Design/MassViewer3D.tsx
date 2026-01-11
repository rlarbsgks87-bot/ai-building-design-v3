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
  // 일조권 적용 대상: 전용주거지역, 일반주거지역만
  // 준주거지역, 상업지역, 공업지역 등은 적용 안됨
  if (useZone) {
    const zone = useZone.toLowerCase()
    // 준주거지역은 일조권 적용 안됨
    if (zone.includes('준주거')) return 0
    // 주거지역 외(상업, 공업, 녹지 등)는 적용 안됨
    if (!zone.includes('주거')) return 0
  }

  if (height <= 10) {
    // 10m 이하: 1.5m 이격 (건축법 시행령 제86조)
    return 1.5
  } else {
    // 10m 초과: 해당 높이의 1/2 이격
    // 법 조문: "해당 건축물 각 부분 높이의 2분의 1 이상"
    // 예: 12m → 6m, 16.5m → 8.25m, 20m → 10m
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
  angle?: number  // 도로 각도 (도 단위, 동쪽=0°, 반시계 방향)
}

interface AdjacentParcel {
  pnu: string
  geometry: [number, number][]  // [lng, lat][] 폴리곤 좌표
  jimok: string                 // 지목 (대, 전, 답 등)
  jibun?: string                // 지번 (선택)
  direction: 'north' | 'south' | 'east' | 'west' | 'unknown'
  center: { lng: number; lat: number }
  height?: number               // 건물 높이 (미터)
  floors?: number               // 지상 층수
  underground_floors?: number   // 지하 층수
  width?: number                // 건물/필지 폭 (미터)
  depth?: number                // 건물/필지 깊이 (미터)
  name?: string                 // 건물명 (건축물대장)
  main_purpose?: string         // 주용도 (예: "제1종근린생활시설")
  bd_mgt_sn?: string            // 건물관리번호
  has_registry?: boolean        // 건축물대장 데이터 여부
}

interface MassViewer3DProps {
  building: BuildingConfig
  landArea: number
  landDimensions?: { width: number; depth: number }  // VWorld에서 가져온 실제 필지 크기
  landPolygon?: [number, number][]  // [lng, lat][] 지적도 폴리곤 좌표
  adjacentRoads?: AdjacentRoad[]  // 인접 도로 데이터 (지적도 기반)
  adjacentParcels?: AdjacentParcel[]  // 주변 필지 데이터 (지적도 기반)
  kakaoRoads?: KakaoRoad[]  // 도로명 정보 (Kakao API fallback)
  roadWidth?: { min: number; max: number; average: number; source: string }  // 도로 폭 정보
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
  // X축 반전: 동쪽(높은 경도) = -X, 서쪽(낮은 경도) = +X
  const points: [number, number][] = polygon.map(([lng, lat]) => {
    const x = -(lng - centerLng) * metersPerDegreeLng
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
// setbacks: { front(전면/도로), back(후면/일조권), left(좌측), right(우측) }
// rotationAngle: 건물 회전 각도 (라디안). 0이면 기존 축 정렬 방식 사용
// 엣지(변)의 법선 방향으로 이격거리 결정 (정점 위치가 아닌 변 방향 기준)
function offsetPolygonDirectional(
  points: [number, number][],
  setbacks: { front: number; back: number; left: number; right: number },
  rotationAngle: number = 0
): [number, number][] {
  if (points.length < 3) return points

  // 중복 점 제거 (0.01m 이내의 점은 동일 점으로 간주)
  const cleanedPoints: [number, number][] = []
  for (let i = 0; i < points.length; i++) {
    const curr = points[i]
    const prev = cleanedPoints[cleanedPoints.length - 1]
    if (!prev) {
      cleanedPoints.push(curr)
    } else {
      const dist = Math.sqrt((curr[0] - prev[0]) ** 2 + (curr[1] - prev[1]) ** 2)
      if (dist > 0.01) {
        cleanedPoints.push(curr)
      }
    }
  }
  // 마지막 점과 첫 점도 비교
  if (cleanedPoints.length > 1) {
    const first = cleanedPoints[0]
    const last = cleanedPoints[cleanedPoints.length - 1]
    const dist = Math.sqrt((first[0] - last[0]) ** 2 + (first[1] - last[1]) ** 2)
    if (dist < 0.01) {
      cleanedPoints.pop()
    }
  }

  if (cleanedPoints.length < 3) return points

  const result: [number, number][] = []
  const n = cleanedPoints.length

  // 폴리곤 방향 확인
  const area = getPolygonArea(cleanedPoints)
  const direction = area >= 0 ? 1 : -1

  // 각 엣지의 법선과 이격거리 계산
  const edgeNormals: { nx: number; nz: number; offset: number }[] = []

  for (let i = 0; i < n; i++) {
    const p1 = cleanedPoints[i]
    const p2 = cleanedPoints[(i + 1) % n]

    const dx = p2[0] - p1[0]
    const dz = p2[1] - p1[1]
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 0.01) {
      // 매우 짧은 엣지: 이전 엣지의 방향 사용 또는 기본값 0
      edgeNormals.push({ nx: 0, nz: 0, offset: 0 })
      continue
    }

    // 외부 법선 벡터 (반시계=양수 면적일 때 오른쪽이 외부)
    const nx = direction * dz / len
    const nz = -direction * dx / len

    // 법선 방향으로 이격거리 결정 (회전 각도 고려)
    // 회전 각도가 있으면 회전된 좌표계에서 방향 판단
    const cos = Math.cos(rotationAngle)
    const sin = Math.sin(rotationAngle)

    // 건물 좌표계에서의 방향 벡터들과 법선의 내적 계산
    // front: 건물 -Z 방향 = [sin(θ), -cos(θ)]
    // back:  건물 +Z 방향 = [-sin(θ), cos(θ)]
    // left:  건물 +X 방향 = [cos(θ), sin(θ)]
    // right: 건물 -X 방향 = [-cos(θ), -sin(θ)]
    const dotFront = nx * sin + nz * (-cos)  // 전면 방향과의 내적
    const dotBack = nx * (-sin) + nz * cos   // 후면 방향과의 내적
    const dotLeft = nx * cos + nz * sin      // 좌측 방향과의 내적
    const dotRight = nx * (-cos) + nz * (-sin) // 우측 방향과의 내적

    // 가장 큰 내적값의 방향으로 이격거리 적용
    let offset: number
    let direction_name: string
    const maxDot = Math.max(dotFront, dotBack, dotLeft, dotRight)
    if (maxDot === dotFront) {
      offset = setbacks.front
      direction_name = 'front'
    } else if (maxDot === dotBack) {
      offset = setbacks.back
      direction_name = 'back'
    } else if (maxDot === dotLeft) {
      offset = setbacks.left
      direction_name = 'left'
    } else {
      offset = setbacks.right
      direction_name = 'right'
    }

    console.log(`[offsetPolygon] Edge ${i}: 방향=${direction_name}, offset=${offset}m, 법선=(${nx.toFixed(2)}, ${nz.toFixed(2)})`)
    edgeNormals.push({ nx, nz, offset })
  }

  // 각 정점에서 인접 엣지들의 평균 이격으로 오프셋
  for (let i = 0; i < n; i++) {
    const curr = cleanedPoints[i]
    const prevEdge = edgeNormals[(i - 1 + n) % n]  // 이전 엣지 (curr로 끝나는)
    const currEdge = edgeNormals[i]                 // 현재 엣지 (curr에서 시작)

    // 두 엣지의 평균 법선과 평균 이격거리
    const avgNx = (prevEdge.nx + currEdge.nx) / 2
    const avgNz = (prevEdge.nz + currEdge.nz) / 2
    const avgLen = Math.sqrt(avgNx * avgNx + avgNz * avgNz)

    // 이격거리: 두 엣지 중 더 큰 값 사용 (보수적)
    const offset = Math.max(prevEdge.offset, currEdge.offset)

    // offset이 0이면 원본 점 그대로 사용
    if (offset === 0) {
      result.push(curr)
      continue
    }

    if (avgLen > 0.1) {
      // 법선 벡터 길이가 충분히 클 때만 스케일 적용
      const scale = 1 / avgLen
      result.push([
        curr[0] - avgNx * scale * offset,
        curr[1] - avgNz * scale * offset
      ])
    } else if (avgLen > 0) {
      // 날카로운 코너: 스케일 제한 (최대 3배)
      const scale = 1 / Math.max(avgLen, 0.33)
      result.push([
        curr[0] - avgNx * scale * offset,
        curr[1] - avgNz * scale * offset
      ])
    } else {
      result.push(curr)
    }
  }

  return result
}

// 폴리곤 내 최대 내접 사각형 계산 (근사) - 회전 각도 고려
function getMaxInscribedRect(points: [number, number][], rotationAngle: number = 0): {
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

  // 회전된 방향으로 Ray Casting (건물 회전 각도 반영)
  // rotationAngle만큼 회전된 좌표계에서 직교 방향으로 거리 측정
  const cos = Math.cos(rotationAngle)
  const sin = Math.sin(rotationAngle)

  // 회전된 좌표계의 4방향 (건물의 전후좌우)
  const directions = [
    [cos, sin],    // 회전된 +X (건물 왼쪽)
    [-cos, -sin],  // 회전된 -X (건물 오른쪽)
    [-sin, cos],   // 회전된 +Z (건물 뒤쪽/북쪽)
    [sin, -cos],   // 회전된 -Z (건물 앞쪽/남쪽)
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

  // 회전된 좌표계에서의 사각형 크기
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

// 전면 도로(남쪽) 방향 각도 계산 - 건물을 도로와 평행하게 배치하기 위함
function calculateFrontRoadAngle(
  localPolygon: { points: [number, number][]; center: [number, number] }
): number {
  const { points, center } = localPolygon
  if (points.length < 3) return 0

  const [centerX, centerZ] = center

  // 각 엣지의 중점, 각도, 길이 계산
  const edges = points.map((p, i) => {
    const next = points[(i + 1) % points.length]
    const midX = (p[0] + next[0]) / 2
    const midZ = (p[1] + next[1]) / 2
    const dx = next[0] - p[0]
    const dz = next[1] - p[1]
    const angle = Math.atan2(dz, dx)  // 라디안
    const length = Math.sqrt(dx * dx + dz * dz)
    return { midX, midZ, angle, length }
  })

  // 남쪽 엣지들 필터링 (중점이 폴리곤 중심보다 남쪽에 있는 엣지)
  const southEdges = edges.filter(e => e.midZ < centerZ)

  if (southEdges.length === 0) {
    // 남쪽 엣지가 없으면 가장 긴 엣지 사용
    const longestEdge = edges.reduce((max, e) => e.length > max.length ? e : max, edges[0])
    return -longestEdge.angle
  }

  // 남쪽 엣지 중 가장 긴 것 선택 (전면 도로에 접한 엣지)
  const frontEdge = southEdges.reduce((max, e) => e.length > max.length ? e : max, southEdges[0])

  // 건물 회전 각도: 엣지 각도의 반대 (건물이 엣지와 평행하도록)
  // 엣지가 수평(angle=0)이면 회전 없음, 기울어지면 그만큼 회전
  return -frontEdge.angle
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

  // 폴리곤 좌표를 로컬 좌표로 변환
  const localPolygonData = useMemo(() => {
    if (landPolygon && landPolygon.length >= 3) {
      return convertPolygonToLocal(landPolygon)
    }
    return null
  }, [landPolygon])

  // 건물 회전 각도 계산 (전면 도로와 평행하게 배치)
  const buildingRotation = useMemo(() => {
    if (localPolygonData && localPolygonData.points.length >= 3) {
      const angle = calculateFrontRoadAngle(localPolygonData)
      console.log('[BuildingMass] 건물 회전 각도:', (angle * 180 / Math.PI).toFixed(1), '도')
      return angle
    }
    return 0
  }, [localPolygonData])

  // 폴리곤 좌표를 로컬 좌표로 변환 후 방향별 이격거리 적용
  const buildableArea = useMemo(() => {
    if (localPolygonData && localPolygonData.points.length >= 3) {
      // 방향별 이격거리 적용된 내부 폴리곤 - 회전 각도 기준으로 방향 결정
      const shrunkPolygon = offsetPolygonDirectional(localPolygonData.points, directionalSetbacks, buildingRotation)
      // 최대 내접 사각형 계산 - 건물 회전 각도 반영
      const rect = getMaxInscribedRect(shrunkPolygon, buildingRotation)
      console.log('[BuildingMass] 내접 사각형:', rect.width.toFixed(1), 'x', rect.depth.toFixed(1), 'm, 중심:', rect.centerX.toFixed(1), rect.centerZ.toFixed(1))
      return rect
    }
    return null
  }, [localPolygonData, directionalSetbacks, buildingRotation])

  // 건물 가용 영역 계산 (폴리곤 기반 또는 bounding box 기반)
  const availableWidth = buildableArea
    ? buildableArea.width
    : landWidth - building.setbacks.left - building.setbacks.right
  const availableDepth = buildableArea
    ? buildableArea.depth
    : landDepth - building.setbacks.front - baseBackSetback
  const rawBuildingArea = availableWidth * availableDepth

  // 건물 크기를 실제 buildingArea에 맞게 조정 (법정 한도 반영)
  // 중요: areaRatio는 최대 1.0으로 제한 (이격거리 영역을 벗어나지 않도록)
  const rawAreaRatio = building.buildingArea > 0 && rawBuildingArea > 0
    ? Math.sqrt(building.buildingArea / rawBuildingArea)
    : 1
  const areaRatio = Math.min(rawAreaRatio, 1.0)  // 최대 1.0으로 제한

  // 건물 너비/깊이에 비율 적용 (이격거리 영역 내에서만)
  const buildingWidth = Math.max(3, availableWidth * areaRatio)

  console.log('[BuildingMass] 면적비율:', rawAreaRatio.toFixed(2), '→', areaRatio.toFixed(2), '(제한됨:', rawAreaRatio > 1, ')')

  // 건물 높이 계산
  const buildingHeight = building.floors * building.floorHeight

  // 건물 중심 위치 계산 (폴리곤 기반 또는 bounding box 기반)
  // X축 반전됨: +X=서쪽, -X=동쪽. left=서쪽(+X), right=동쪽(-X)
  const centerX = buildableArea
    ? buildableArea.centerX
    : (building.setbacks.right - building.setbacks.left) / 2  // X축 반전으로 부호 반전
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
        // 중심 위치: 로컬 좌표 (group center = 0)
        // 축소된 만큼 남쪽(-)으로 이동
        floorCenterZ = -depthReduction / 2
      } else {
        // bounding box 기반
        const floorAvailableDepth = landDepth - building.setbacks.front - backSetback
        floorDepth = Math.max(1, floorAvailableDepth * areaRatio)
        // 로컬 좌표: 깊이 기준 중앙 배치
        // 계단형일 때 상층부 축소 반영
        const depthDiff = (availableDepth - floorAvailableDepth) / 2
        floorCenterZ = -depthDiff
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
    <group position={[centerX, 0, baseCenterZ]} rotation={[0, buildingRotation, 0]}>
      {/* 층별 매스 (계단형) - 회전된 좌표계에서 Z는 0 기준 */}
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

    // 폴리곤 좌표 변환 (X축 반전)
    const localPoints: [number, number][] = road.geometry.map(([lng, lat]) => {
      const x = -(lng - centerLng) * metersPerDegreeLng
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
    const roadCenterX = -(road.center.lng - centerLng) * metersPerDegreeLng
    const roadCenterZ = (road.center.lat - centerLat) * metersPerDegreeLat

    // 디버그: RoadPolygon의 실제 좌표
    const maxZ = Math.max(...localPoints.map(p => p[1]))
    console.log(`[RoadPolygon] ${road.direction}: maxZ=${maxZ.toFixed(1)}m, center=(${roadCenterX.toFixed(1)}, ${roadCenterZ.toFixed(1)})`)

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

// 주변 필지 폴리곤 렌더링
function AdjacentParcelPolygon({
  parcel,
  landCenter,
}: {
  parcel: AdjacentParcel
  landCenter: [number, number]  // [lng, lat] 대지 중심점
}) {
  // 필지 폴리곤을 대지 중심 기준 로컬 좌표로 변환
  const { parcelShape, boundaryPoints, labelPosition, jimokLabel } = useMemo(() => {
    if (!parcel.geometry || parcel.geometry.length < 3) {
      return { parcelShape: null, boundaryPoints: [], labelPosition: [0, 0, 0], jimokLabel: '' }
    }

    const centerLng = landCenter[0]
    const centerLat = landCenter[1]

    // WGS84 → 미터 변환
    const metersPerDegreeLat = 111320
    const metersPerDegreeLng = 111320 * Math.cos(centerLat * Math.PI / 180)

    // 폴리곤 좌표 변환 (X축 반전)
    const localPoints: [number, number][] = parcel.geometry.map(([lng, lat]) => {
      const x = -(lng - centerLng) * metersPerDegreeLng
      const z = (lat - centerLat) * metersPerDegreeLat
      return [x, z]
    })

    // Three.js Shape 생성 (XY 평면 → XZ 평면으로 회전)
    const shape = new THREE.Shape()
    shape.moveTo(localPoints[0][0], -localPoints[0][1])
    for (let i = 1; i < localPoints.length; i++) {
      shape.lineTo(localPoints[i][0], -localPoints[i][1])
    }
    shape.closePath()

    // 경계선 포인트
    const boundaryPts: [number, number, number][] = localPoints.map(([x, z]) => [x, 0.01, z])
    if (boundaryPts.length > 0) {
      boundaryPts.push([...boundaryPts[0]])
    }

    // 라벨 위치 (필지 중심)
    const parcelCenterX = -(parcel.center.lng - centerLng) * metersPerDegreeLng
    const parcelCenterZ = (parcel.center.lat - centerLat) * metersPerDegreeLat

    // 지목 라벨 (지번에서 숫자 제거)
    const label = parcel.jimok || ''

    // 디버그: 필지 위치와 지목
    const maxZ = Math.max(...localPoints.map(p => p[1]))
    if (maxZ > 0) {  // 북쪽에 있는 필지만 출력
      console.log(`[AdjacentParcel] 북쪽 필지: jimok=${parcel.jimok}, maxZ=${maxZ.toFixed(1)}m, dir=${parcel.direction}`)
    }

    return {
      parcelShape: shape,
      boundaryPoints: boundaryPts,
      labelPosition: [parcelCenterX, 0.3, parcelCenterZ] as [number, number, number],
      jimokLabel: label,
    }
  }, [parcel, landCenter])

  if (!parcelShape) return null

  // 지목에 따른 색상 (투명도 높게)
  const getJimokColor = (jimok: string) => {
    switch (jimok) {
      case '대': return '#8b5cf6'  // 대지 - 보라
      case '전': return '#22c55e'  // 전 - 녹색
      case '답': return '#3b82f6'  // 답 - 파랑
      case '임': return '#059669'  // 임야 - 진녹색
      case '잡': return '#f59e0b'  // 잡종지 - 주황
      default: return '#6b7280'   // 기타 - 회색
    }
  }

  // 지목 기반 색상 (건축물대장 정보는 필지 위치와 맞지 않아 사용 안함)
  const parcelColor = getJimokColor(parcel.jimok)

  return (
    <group>
      {/* 필지 폴리곤 (반투명) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <shapeGeometry args={[parcelShape]} />
        <meshStandardMaterial
          color={parcelColor}
          side={THREE.DoubleSide}
          transparent
          opacity={0.25}
        />
      </mesh>

      {/* 필지 경계선 */}
      <Line
        points={boundaryPoints}
        color={parcelColor}
        lineWidth={1.5}
      />

      {/* 지목 라벨 (지번) */}
      {jimokLabel && (
        <Text
          position={[labelPosition[0], 0.3, labelPosition[2]]}
          fontSize={0.6}
          color="#9ca3af"
          anchorX="center"
          rotation={[-Math.PI / 2, 0, 0]}
          outlineWidth={0.02}
          outlineColor="#1f2937"
        >
          {jimokLabel}
        </Text>
      )}
    </group>
  )
}

// 대지 경계 및 이격선
function LandBoundary({
  landDimensions,
  landPolygon,
  adjacentRoads,
  adjacentParcels,
  kakaoRoads,
  roadWidth,
  setbacks,
  actualBackSetback,
}: {
  landDimensions: { width: number; depth: number }
  landPolygon?: [number, number][]  // [lng, lat][] 지적도 폴리곤 좌표
  adjacentRoads?: AdjacentRoad[]  // 인접 도로 데이터
  adjacentParcels?: AdjacentParcel[]  // 주변 필지 데이터
  kakaoRoads?: KakaoRoad[]  // 도로명 정보 (Kakao fallback)
  roadWidth?: { min: number; max: number; average: number; source: string }  // 도로 폭 정보
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

  // 건물 회전 각도 계산 (전면 도로와 평행하게 배치)
  const buildingRotationAngle = useMemo(() => {
    if (localPolygon && localPolygon.points.length >= 3) {
      return calculateFrontRoadAngle(localPolygon)
    }
    return 0
  }, [localPolygon])

  // 방향별 이격거리 적용된 내부 폴리곤 - 회전 각도 기준으로 방향 결정
  const offsetPolygonPoints = useMemo(() => {
    if (localPolygon && localPolygon.points.length >= 3) {
      console.log('[Land3DView] 이격거리 적용:', displaySetbacks, '회전:', (buildingRotationAngle * 180 / Math.PI).toFixed(1) + '도')
      return offsetPolygonDirectional(localPolygon.points, displaySetbacks, buildingRotationAngle)
    }
    return null
  }, [localPolygon, displaySetbacks, buildingRotationAngle])

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

      {/* 주변 필지 표시 (지적도 데이터) */}
      {adjacentParcels && adjacentParcels.length > 0 && localPolygon && (
        adjacentParcels.map((parcel, idx) => (
          <AdjacentParcelPolygon
            key={parcel.pnu || idx}
            parcel={parcel}
            landCenter={localPolygon.center}
          />
        ))
      )}

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
        // Fallback: 카카오 API 기반 도로 방향 + 각도로 정확한 도로 배치
        (() => {
          // 도로 방향 및 각도 (카카오 API 기반)
          const roadData = kakaoRoads?.[0]
          const roadDirection = roadData?.direction || 'south'
          const roadName = roadData?.road_name || '도로'
          const apiRoadAngle = roadData?.angle  // 도 단위 (동쪽=0°, 반시계)
          const isNorthSouth = roadDirection === 'north' || roadDirection === 'south'
          const isNorth = roadDirection === 'north'
          const isEast = roadDirection === 'east'

          // 도로 폭 (API에서 제공하거나 기본값 8m)
          const actualRoadWidth = roadWidth?.average || 8
          const halfRoadWidth = actualRoadWidth / 2

          // 도로 위치 및 회전 계산
          let roadRotation = 0 // Y축 회전 (라디안)
          let roadCenterX = 0
          let roadCenterZ = 0
          let roadLength = width + 10

          // API에서 제공한 각도가 있으면 그것을 사용
          if (apiRoadAngle !== undefined && apiRoadAngle !== null) {
            // API 각도: 도 단위, 동쪽=0°, 반시계 방향 (-90° ~ 90° 범위)
            // Three.js Y축 회전: 양수 = 반시계 방향 (위에서 내려다볼 때)
            // 도로를 X축(동서) 방향으로 놓고 Y축 회전
            roadRotation = apiRoadAngle * (Math.PI / 180)

            // 방향에 따른 위치 설정 (도로 중심 = 대지 경계 + 도로 폭의 절반)
            if (isNorthSouth) {
              roadCenterZ = isNorth ? depth / 2 + halfRoadWidth : -depth / 2 - halfRoadWidth
              roadLength = width + 10
            } else {
              roadCenterX = isEast ? width / 2 + halfRoadWidth : -width / 2 - halfRoadWidth
              roadLength = depth + 10
            }
          } else if (isNorthSouth) {
            // Fallback: 필지 폴리곤에서 도로 접합 변의 각도 계산
            roadCenterZ = isNorth ? depth / 2 + halfRoadWidth : -depth / 2 - halfRoadWidth
            roadLength = width + 10

            if (localPolygon && localPolygon.points.length >= 3) {
              const edges = localPolygon.points.map((p, i) => {
                const next = localPolygon.points[(i + 1) % localPolygon.points.length]
                const midZ = (p[1] + next[1]) / 2
                const midX = (p[0] + next[0]) / 2
                const dx = next[0] - p[0]
                const dz = next[1] - p[1]
                const angle = Math.atan2(dz, dx)
                return { midZ, midX, angle, length: Math.sqrt(dx*dx + dz*dz) }
              })

              const targetEdge = isNorth
                ? edges.reduce((max, e) => e.midZ > max.midZ ? e : max, edges[0])
                : edges.reduce((min, e) => e.midZ < min.midZ ? e : min, edges[0])

              roadRotation = -targetEdge.angle
              roadCenterX = targetEdge.midX
              roadCenterZ = targetEdge.midZ + (isNorth ? halfRoadWidth : -halfRoadWidth)
            }
          } else {
            // 동/서 방향 도로 (세로 방향 도로)
            // X축 반전: 동쪽=-X, 서쪽=+X
            roadCenterX = isEast ? -width / 2 - halfRoadWidth : width / 2 + halfRoadWidth
            roadLength = depth + 10
            roadRotation = Math.PI / 2 // 90도 회전

            if (localPolygon && localPolygon.points.length >= 3) {
              const edges = localPolygon.points.map((p, i) => {
                const next = localPolygon.points[(i + 1) % localPolygon.points.length]
                const midZ = (p[1] + next[1]) / 2
                const midX = (p[0] + next[0]) / 2
                const dx = next[0] - p[0]
                const dz = next[1] - p[1]
                const angle = Math.atan2(dz, dx)
                return { midZ, midX, angle, length: Math.sqrt(dx*dx + dz*dz) }
              })

              // X축 반전: 동쪽=min X(-X), 서쪽=max X(+X)
              const targetEdge = isEast
                ? edges.reduce((min, e) => e.midX < min.midX ? e : min, edges[0])
                : edges.reduce((max, e) => e.midX > max.midX ? e : max, edges[0])

              roadRotation = -targetEdge.angle + Math.PI / 2
              roadCenterX = targetEdge.midX + (isEast ? -halfRoadWidth : halfRoadWidth)
              roadCenterZ = targetEdge.midZ
            }
          }

          // 방향 라벨
          const directionLabel = {
            north: '(북측)',
            south: '(남측)',
            east: '(동측)',
            west: '(서측)',
          }[roadDirection] || ''

          return (
            <group
              position={[roadCenterX, 0, roadCenterZ]}
              rotation={[0, roadRotation, 0]}
            >
              {/* 도로 평면 */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
                <planeGeometry args={[roadLength, actualRoadWidth]} />
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
                  [-roadLength / 2, 0.02, isNorth || isEast ? -halfRoadWidth : halfRoadWidth],
                  [roadLength / 2, 0.02, isNorth || isEast ? -halfRoadWidth : halfRoadWidth],
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

              {/* 도로 방향 표시 */}
              <Text
                position={[roadLength / 2 - 2, 0.5, 0]}
                fontSize={0.8}
                color="#fbbf24"
                anchorX="left"
                rotation={[-Math.PI / 2, 0, 0]}
                outlineWidth={0.03}
                outlineColor="#000000"
              >
                {directionLabel}
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
// 폴리곤 기반 3D Envelope - 실제 필지 형상 반영
//
// 법 조문:
// 1. 높이 10미터 이하인 부분: 인접 대지경계선으로부터 1.5미터 이상
// 2. 높이 10미터를 초과하는 부분: 인접 대지경계선으로부터 해당 건축물 각 부분 높이의 2분의 1 이상
function NorthSetbackEnvelope({
  landDimensions,
  landPolygon,
  landCenter,
  maxHeight,
  useZone,
  buildingHeight,
  adjacentRoads,
  adjacentParcels,
}: {
  landDimensions: { width: number; depth: number }
  landPolygon?: [number, number][]  // [lng, lat][] 실제 필지 폴리곤
  landCenter?: [number, number]  // [lng, lat] 필지 중심점 (RoadPolygon과 동일한 기준)
  maxHeight: number
  useZone?: string
  buildingHeight?: number
  adjacentRoads?: AdjacentRoad[]  // 인접 도로 정보
  adjacentParcels?: AdjacentParcel[]  // 인접 필지 정보
}) {
  const { width, depth } = landDimensions

  // 일조권 적용 대상: 전용주거지역, 일반주거지역만
  if (useZone) {
    const zone = useZone.toLowerCase()
    if (zone.includes('준주거') || !zone.includes('주거')) {
      return null
    }
  }

  // 북쪽에 도로만 있는지 확인 (geometry 기반 + direction 기반)
  // landPolygon 중심 위도 계산
  const parcelCenterLat = landPolygon && landPolygon.length > 0
    ? landPolygon.reduce((sum, p) => sum + p[1], 0) / landPolygon.length
    : 0

  const hasNorthRoad = adjacentRoads?.some(road => {
    if (road.direction === 'north') return true
    // geometry 기반: 도로 중심이 필지 중심보다 북쪽이면 북쪽 도로
    const roadCenterLat = road.geometry.reduce((sum, p) => sum + p[1], 0) / road.geometry.length
    return roadCenterLat > parcelCenterLat
  })

  const hasNorthParcel = adjacentParcels?.some(parcel => {
    if (parcel.jimok === '도') return false // 도로 지목 제외
    if (parcel.direction === 'north') return true
    // geometry 기반: 필지 중심이 우리 필지 중심보다 북쪽이면 북쪽 대지
    const pCenterLat = parcel.geometry.reduce((sum, p) => sum + p[1], 0) / parcel.geometry.length
    return pCenterLat > parcelCenterLat
  })

  // 북쪽에 대지가 전혀 없고 도로만 있으면 일조권 미적용
  if (hasNorthRoad && !hasNorthParcel) {
    return null
  }

  // 실제 건물 높이에서 필요한 이격거리
  const actualBuildingSetback = buildingHeight ? getNorthSetbackAtHeight(buildingHeight) : 0
  const setbackAt10m = 5
  const maxSetback = getNorthSetbackAtHeight(maxHeight)

  // 폴리곤을 로컬 좌표로 변환하고 북쪽 경계 추출 (도로 인접 부분 제외)
  const { northEdges, localPoints, center } = useMemo(() => {
    if (!landPolygon || landPolygon.length < 3) {
      // 폴리곤 없으면 직사각형 fallback
      const halfW = width / 2
      const halfD = depth / 2
      return {
        northEdges: [[[-halfW, halfD], [halfW, halfD]] as [[number, number], [number, number]]],
        localPoints: [[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]] as [number, number][],
        center: [0, 0] as [number, number]
      }
    }

    // WGS84 → 로컬 미터 변환 (landCenter가 있으면 사용, RoadPolygon과 동일한 기준점)
    const lngs = landPolygon.map(p => p[0])
    const lats = landPolygon.map(p => p[1])
    const centerLng = landCenter ? landCenter[0] : (Math.min(...lngs) + Math.max(...lngs)) / 2
    const centerLat = landCenter ? landCenter[1] : (Math.min(...lats) + Math.max(...lats)) / 2
    const metersPerLng = 111320 * Math.cos(centerLat * Math.PI / 180)
    const metersPerLat = 111320

    console.log('[일조권] 중심점:', landCenter ? 'landCenter 사용' : 'bbox 중심', `(${centerLng.toFixed(6)}, ${centerLat.toFixed(6)})`)

    const localPts = landPolygon.map(([lng, lat]) => [
      -(lng - centerLng) * metersPerLng,  // X축 반전
      (lat - centerLat) * metersPerLat
    ] as [number, number])

    // 폴리곤 중심 계산
    const cx = localPts.reduce((s, p) => s + p[0], 0) / localPts.length
    const cz = localPts.reduce((s, p) => s + p[1], 0) / localPts.length

    // 북쪽에 있는 인접 필지(대지)의 로컬 폴리곤 좌표 계산 (지목='도' 제외)
    const allParcelPolygons = (adjacentParcels || [])
      .filter(parcel => parcel.jimok !== '도')  // 도로 지목 제외
      .map(parcel => {
        const polygon = parcel.geometry.map(([lng, lat]) => [
          -(lng - centerLng) * metersPerLng,
          (lat - centerLat) * metersPerLat
        ] as [number, number])
        const maxZ = Math.max(...polygon.map(p => p[1]))
        const minZ = Math.min(...polygon.map(p => p[1]))
        return { polygon, maxZ, minZ, jimok: parcel.jimok }
      })

    // 북쪽에 있는 필지만 필터링 (maxZ > 0 = 필지 중심보다 북쪽)
    const northParcelPolygons = allParcelPolygons.filter(p => p.maxZ > 0)

    console.log('[일조권] 인접 필지(대지):', allParcelPolygons.length, '개, 북쪽:', northParcelPolygons.length, '개')

    // 점과 폴리곤 사이의 최소 거리 계산 함수
    const distanceToPolygon = (px: number, pz: number, polygon: [number, number][]) => {
      let minDist = Infinity
      for (let i = 0; i < polygon.length; i++) {
        const [x1, z1] = polygon[i]
        const [x2, z2] = polygon[(i + 1) % polygon.length]
        // 선분과 점 사이의 거리
        const dx = x2 - x1
        const dz = z2 - z1
        const len2 = dx * dx + dz * dz
        if (len2 === 0) {
          minDist = Math.min(minDist, Math.sqrt((px - x1) ** 2 + (pz - z1) ** 2))
        } else {
          const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / len2))
          const projX = x1 + t * dx
          const projZ = z1 + t * dz
          minDist = Math.min(minDist, Math.sqrt((px - projX) ** 2 + (pz - projZ) ** 2))
        }
      }
      return minDist
    }

    // 북쪽을 향하는 edge 추출 (도로 인접 부분 제외)
    const edges: [[number, number], [number, number]][] = []

    for (let i = 0; i < localPts.length; i++) {
      const p1 = localPts[i]
      const p2 = localPts[(i + 1) % localPts.length]

      // edge 중점
      const midX = (p1[0] + p2[0]) / 2
      const midZ = (p1[1] + p2[1]) / 2

      // edge가 폴리곤 중심보다 북쪽(+Z)에 있으면 북쪽 경계 후보
      if (midZ > cz) {
        // edge 법선 방향 확인 (반시계 방향 폴리곤 가정)
        const dx = p2[0] - p1[0]
        const normalZ = -dx  // 반시계 방향 폴리곤의 외부 법선 Z 성분

        // 법선이 +Z 방향이면 북쪽 경계
        if (normalZ > 0 || midZ > cz + 1) {
          // edge 중점에서 북쪽(+Z) 방향으로 5m 지점 확인
          // 그 지점이 인접 필지 안에 있거나 가까우면 → 인접 대지 경계
          // 멀면 → 도로 경계 (모델링 안된 부분)
          const checkPointZ = midZ + 5  // 북쪽으로 5m
          const checkPointX = midX

          let minDistToParcel = Infinity

          for (const { polygon: parcelPoly } of northParcelPolygons) {
            // 북쪽 체크 포인트에서 필지까지의 거리
            const dist = distanceToPolygon(checkPointX, checkPointZ, parcelPoly)
            minDistToParcel = Math.min(minDistToParcel, dist)
          }

          // 북쪽 5m 지점에서 인접 필지까지 5m 이내면 인접 대지 → 일조권 적용
          // (총 10m 이내에 필지가 있음)
          // 5m 초과면 도로로 간주 → 일조권 제외
          const isAdjacentToParcel = minDistToParcel < 5
          const isRoad = !isAdjacentToParcel

          console.log(`[일조권] Edge ${i}: midZ=${midZ.toFixed(1)}, 북쪽체크점(${checkPointX.toFixed(1)}, ${checkPointZ.toFixed(1)}), 인접필지거리=${minDistToParcel.toFixed(1)}m, 대지인접=${isAdjacentToParcel}, 도로=${isRoad}`)

          // 인접 대지인 경우만 일조권 적용 (도로면 제외)
          if (isAdjacentToParcel) {
            edges.push([p1, p2])
          }
        }
      }
    }

    return { northEdges: edges.length > 0 ? edges : [], localPoints: localPts, center: [cx, cz] as [number, number] }
  }, [landPolygon, landCenter, width, depth, adjacentRoads, adjacentParcels])

  // 3D envelope 생성 - 경계선 형태 유지, 정북방향(-Z) 이격
  // 경계선이 대각선이면 엔벨로프도 대각선 형태
  const envelopeGeometry = useMemo(() => {
    const allVertices: number[] = []

    for (const [p1, p2] of northEdges) {
      // 정북방향 이격: 각 점에서 -Z 방향으로 이격
      // 경계선 형태는 유지하면서 이격 방향만 정북

      // 수직 부분 (0~10m) - 1.5m 이격
      const p1_0 = [p1[0], 0, p1[1] - 1.5]
      const p2_0 = [p2[0], 0, p2[1] - 1.5]
      const p1_10 = [p1[0], 10, p1[1] - 1.5]
      const p2_10 = [p2[0], 10, p2[1] - 1.5]

      // 10m에서 5m 이격
      const p1_10_5 = [p1[0], 10, p1[1] - setbackAt10m]
      const p2_10_5 = [p2[0], 10, p2[1] - setbackAt10m]

      // maxHeight에서 H/2 이격
      const p1_max = [p1[0], maxHeight, p1[1] - maxSetback]
      const p2_max = [p2[0], maxHeight, p2[1] - maxSetback]

      // 수직 벽 (0~10m)
      allVertices.push(
        ...p1_0, ...p2_0, ...p1_10,
        ...p2_0, ...p2_10, ...p1_10
      )

      // 10m 수평 연결 (1.5m → 5m)
      allVertices.push(
        ...p1_10, ...p2_10, ...p1_10_5,
        ...p2_10, ...p2_10_5, ...p1_10_5
      )

      // 사선 부분 (10m → maxHeight)
      allVertices.push(
        ...p1_10_5, ...p2_10_5, ...p1_max,
        ...p2_10_5, ...p2_max, ...p1_max
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(allVertices), 3))
    geometry.computeVertexNormals()
    return geometry
  }, [northEdges, maxHeight, maxSetback, setbackAt10m])

  // 북쪽 경계선 points (라인 표시용) - 경계선 형태 유지
  const northBoundaryLines = useMemo(() => {
    const lines: [number, number, number][][] = []

    for (const [p1, p2] of northEdges) {
      // 각 edge 끝점에서 한계선
      lines.push([
        [p1[0], 0, p1[1] - 1.5],
        [p1[0], 10, p1[1] - 1.5],
        [p1[0], 10, p1[1] - setbackAt10m],
        [p1[0], maxHeight, p1[1] - maxSetback],
      ])

      lines.push([
        [p2[0], 0, p2[1] - 1.5],
        [p2[0], 10, p2[1] - 1.5],
        [p2[0], 10, p2[1] - setbackAt10m],
        [p2[0], maxHeight, p2[1] - maxSetback],
      ])
    }

    return lines
  }, [northEdges, maxHeight, maxSetback, setbackAt10m])

  // 북쪽 경계의 대표 중점 (라벨 표시용)
  const northCenter = useMemo(() => {
    if (northEdges.length === 0) return { x: 0, z: depth / 2 }
    const allX = northEdges.flatMap(([p1, p2]) => [p1[0], p2[0]])
    const allZ = northEdges.flatMap(([p1, p2]) => [p1[1], p2[1]])
    return {
      x: (Math.min(...allX) + Math.max(...allX)) / 2,
      z: (Math.min(...allZ) + Math.max(...allZ)) / 2
    }
  }, [northEdges, depth])

  // 북쪽 경계 기준점 (fallback용)
  const northBoundary = depth / 2

  // 대지 인접 북쪽 경계가 없으면 렌더링하지 않음
  if (northEdges.length === 0) {
    return null
  }

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

      {/* === 폴리곤 기반 건물 한계선 (실선) === */}
      {northBoundaryLines.map((linePoints, idx) => (
        <Line
          key={`limit-${idx}`}
          points={linePoints}
          color="#ff0000"
          lineWidth={4}
        />
      ))}

      {/* === 정북 대지경계선 (폴리곤 형태 유지) === */}
      {northEdges.map(([p1, p2], idx) => (
        <Line
          key={`boundary-${idx}`}
          points={[
            [p1[0], 0.1, p1[1]],
            [p2[0], 0.1, p2[1]],
          ]}
          color="#ff0000"
          lineWidth={4}
        />
      ))}

      {/* 경계선에서 수직 기준선 */}
      <Line
        points={[
          [northCenter.x + width / 2 + 2, 0, northCenter.z],
          [northCenter.x + width / 2 + 2, maxHeight, northCenter.z],
        ]}
        color="#ff0000"
        lineWidth={2}
        dashed
        dashSize={0.5}
        gapSize={0.3}
      />

      {/* === 높이 기준선들 === */}
      {/* 10m 높이선 (폴리곤 형태 유지) */}
      {northEdges.map(([p1, p2], idx) => (
        <Line
          key={`h10-${idx}`}
          points={[
            [p1[0], 10, p1[1]],
            [p2[0], 10, p2[1]],
          ]}
          color="#ffaa00"
          lineWidth={2}
          dashed
          dashSize={1}
          gapSize={0.5}
        />
      ))}

      {/* === 라벨들 === */}
      {/* 정북 경계선 라벨 */}
      <Text
        position={[northCenter.x + width / 2 + 4, 1, northCenter.z]}
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
        position={[northCenter.x + width / 2 + 4, 10, northCenter.z]}
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
        position={[northCenter.x, 5, northCenter.z - 0.75]}
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
        position={[northCenter.x, 10.5, northCenter.z - 2.5]}
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
        position={[northCenter.x + width / 2 + 3, (10 + maxHeight) / 2, northCenter.z - (setbackAt10m + maxSetback) / 2]}
        fontSize={0.8}
        color="#ff6666"
        anchorX="left"
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {`H÷2 사선 (1:2)`}
      </Text>

      {/* 실제 건물 높이에서의 이격거리 라벨 */}
      {buildingHeight && buildingHeight > 10 && (
        <Text
          position={[northCenter.x, buildingHeight + 0.5, northCenter.z - actualBuildingSetback / 2]}
          fontSize={0.7}
          color="#00ff00"
          anchorX="center"
          rotation={[-Math.PI / 2, 0, 0]}
          outlineWidth={0.03}
          outlineColor="#000"
        >
          {`건물 ${buildingHeight.toFixed(1)}m → ${actualBuildingSetback.toFixed(1)}m 이격`}
        </Text>
      )}
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

export function MassViewer3D({ building, landArea, landDimensions: propLandDimensions, landPolygon, adjacentRoads, adjacentParcels, kakaoRoads, roadWidth, useZone = '제2종일반주거지역', showNorthSetback = true, floorSetbacks, address }: MassViewer3DProps) {
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
          adjacentParcels={adjacentParcels}
          kakaoRoads={kakaoRoads}
          roadWidth={roadWidth}
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
        {showSunlightEnvelope && landPolygon && landPolygon.length >= 3 && (
          <NorthSetbackEnvelope
            landDimensions={landDimensions}
            landPolygon={landPolygon}
            landCenter={[
              landPolygon.reduce((s, p) => s + p[0], 0) / landPolygon.length,
              landPolygon.reduce((s, p) => s + p[1], 0) / landPolygon.length
            ]}
            maxHeight={Math.max(buildingHeight + 3, buildingHeight * 1.1)}
            useZone={useZone}
            buildingHeight={buildingHeight}
            adjacentRoads={adjacentRoads}
            adjacentParcels={adjacentParcels}
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
