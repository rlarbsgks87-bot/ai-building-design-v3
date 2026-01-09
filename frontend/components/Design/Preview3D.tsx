'use client'

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import * as THREE from 'three'

// 간단한 빌딩 매스
function Building({ position, height, width, depth, color }: {
  position: [number, number, number]
  height: number
  width: number
  depth: number
  color: string
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  return (
    <group position={position}>
      <mesh ref={meshRef} position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} transparent opacity={0.9} />
      </mesh>
      <lineSegments position={[0, height / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
        <lineBasicMaterial color="#1e3a5f" />
      </lineSegments>
    </group>
  )
}

// 대지 평면
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial color="#8b6b4a" />
    </mesh>
  )
}

// 자동 회전 카메라
function RotatingCamera() {
  const angle = useRef(0)

  useFrame(({ camera }, delta) => {
    angle.current += delta * 0.2
    const radius = 35
    camera.position.x = Math.sin(angle.current) * radius
    camera.position.z = Math.cos(angle.current) * radius
    camera.position.y = 25
    camera.lookAt(0, 8, 0)
  })

  return null
}

export function Preview3D() {
  return (
    <div className="w-full h-full">
      <Canvas shadows camera={{ position: [30, 25, 30], fov: 40 }}>
        <RotatingCamera />

        {/* 조명 */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[20, 30, 10]}
          intensity={1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />

        {/* 환경 */}
        <Environment preset="city" />
        <fog attach="fog" args={['#2d3748', 40, 100]} />

        {/* 대지 */}
        <Ground />

        {/* 메인 빌딩 - 고층 */}
        <Building
          position={[0, 0, 0]}
          height={25}
          width={8}
          depth={10}
          color="#4a5568"
        />

        {/* 저층부 */}
        <Building
          position={[5, 0, 4]}
          height={5}
          width={6}
          depth={8}
          color="#718096"
        />

        {/* 옆 건물 */}
        <Building
          position={[-8, 0, -2]}
          height={12}
          width={5}
          depth={7}
          color="#5a6777"
        />

        {/* 카메라 컨트롤 (비활성화 - 자동 회전 때문) */}
        <OrbitControls
          enabled={false}
          enableZoom={false}
          enablePan={false}
        />
      </Canvas>
    </div>
  )
}
