'use client'

import { useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, Text, Environment } from '@react-three/drei'
import * as THREE from 'three'
import { MassGeometry } from '@/lib/api'

interface MassViewerProps {
  geometry: MassGeometry | null
}

// 건물 매스 컴포넌트
function BuildingMass({ geometry }: { geometry: MassGeometry }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { width, height, depth } = geometry.dimensions

  return (
    <group position={[0, 0, 0]}>
      {/* 건물 매스 */}
      <mesh ref={meshRef} position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color="#3b82f6"
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 건물 외곽선 */}
      <lineSegments position={[0, height / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
        <lineBasicMaterial color="#1d4ed8" linewidth={2} />
      </lineSegments>

      {/* 층별 구분선 */}
      <FloorLines width={width} height={height} depth={depth} />

      {/* 높이 표시 */}
      <Text
        position={[width / 2 + 2, height / 2, 0]}
        fontSize={1.5}
        color="#374151"
        anchorX="left"
      >
        {`${height.toFixed(1)}m`}
      </Text>
    </group>
  )
}

// 층별 구분선
function FloorLines({
  width,
  height,
  depth,
}: {
  width: number
  height: number
  depth: number
}) {
  const floorHeight = 3 // 층고 3m
  const floors = Math.floor(height / floorHeight)
  const lines = []

  for (let i = 1; i < floors; i++) {
    const y = i * floorHeight
    lines.push(
      <line key={i}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={5}
            array={
              new Float32Array([
                -width / 2, y, -depth / 2,
                width / 2, y, -depth / 2,
                width / 2, y, depth / 2,
                -width / 2, y, depth / 2,
                -width / 2, y, -depth / 2,
              ])
            }
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#93c5fd" />
      </line>
    )
  }

  return <>{lines}</>
}

// 대지 경계
function LandBoundary({ geometry }: { geometry: MassGeometry }) {
  const { width, depth } = geometry.dimensions
  const padding = 5 // 이격거리 시각화용 여유

  return (
    <group>
      {/* 대지 바닥 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[width + padding * 2, depth + padding * 2]} />
        <meshStandardMaterial color="#d1fae5" side={THREE.DoubleSide} />
      </mesh>

      {/* 대지 경계선 */}
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <edgesGeometry
          args={[new THREE.PlaneGeometry(width + padding * 2, depth + padding * 2)]}
        />
        <lineBasicMaterial color="#059669" linewidth={2} />
      </lineSegments>
    </group>
  )
}

// 방위 표시
function CompassIndicator() {
  return (
    <group position={[0, 0.1, -20]}>
      <Text fontSize={2} color="#dc2626" anchorX="center" anchorY="middle">
        N
      </Text>
      <mesh position={[0, 0, 2]}>
        <coneGeometry args={[1, 3, 4]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
    </group>
  )
}

// 카메라 컨트롤러
function CameraController({ geometry }: { geometry: MassGeometry | null }) {
  const { camera } = useThree()

  useEffect(() => {
    if (geometry) {
      const { width, height, depth } = geometry.dimensions
      const distance = Math.max(width, height, depth) * 2
      camera.position.set(distance, distance * 0.8, distance)
      camera.lookAt(0, height / 2, 0)
    }
  }, [geometry, camera])

  return null
}

export function MassViewer({ geometry }: MassViewerProps) {
  if (!geometry) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center text-gray-500">
          <p className="text-4xl mb-4">&#127970;</p>
          <p>매스 데이터가 없습니다.</p>
          <p className="text-sm mt-2">토지를 선택하고 매스 계산을 실행하세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <Canvas shadows camera={{ position: [30, 20, 30], fov: 50 }}>
        <CameraController geometry={geometry} />

        {/* 조명 */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[20, 30, 10]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />

        {/* 환경 */}
        <Environment preset="city" />

        {/* 그리드 */}
        <Grid
          position={[0, 0, 0]}
          args={[100, 100]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#e5e7eb"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#9ca3af"
          fadeDistance={50}
          infiniteGrid
        />

        {/* 대지 */}
        <LandBoundary geometry={geometry} />

        {/* 건물 매스 */}
        <BuildingMass geometry={geometry} />

        {/* 방위 */}
        <CompassIndicator />

        {/* 컨트롤 */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={10}
          maxDistance={200}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </div>
  )
}
