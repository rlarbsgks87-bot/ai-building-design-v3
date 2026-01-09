'use client'

import { useState, useEffect, Suspense, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { massApi, landApi } from '@/lib/api'

const MassViewer3D = dynamic(
  () => import('@/components/Design/MassViewer3D').then((mod) => mod.MassViewer3D),
  { ssr: false, loading: () => <ViewerLoading /> }
)

const ShadowDiagram = dynamic(
  () => import('@/components/Design/ShadowDiagram').then((mod) => mod.ShadowDiagram),
  { ssr: false }
)

// 인접대지 최소 이격거리 (건축법 기준)
const MIN_SETBACKS = {
  front: 2,    // 전면 도로 최소 이격
  back: 1.5,   // 후면 최소 이격 (일조권 별도)
  left: 0.5,   // 측면 최소 이격
  right: 0.5,  // 측면 최소 이격
}

// 북쪽 일조권 사선제한 계산 (건축법 시행령 제86조)
//
// 법 조문:
// 1. 높이 10미터 이하인 부분: 인접 대지경계선으로부터 1.5미터 이상
// 2. 높이 10미터를 초과하는 부분: 인접 대지경계선으로부터 해당 건축물 각 부분 높이의 2분의 1 이상
//
// 해석:
// - 10m 이하: 1.5m 이격
// - 10m 초과: 해당 높이 ÷ 2 이격 (예: 20m → 10m, 12m → 6m)
const calculateNorthSetback = (height: number, useZone?: string): number => {
  // 주거지역이 아닌 경우 적용 안함
  if (useZone && !useZone.includes('주거')) {
    return 0
  }
  // 10m 이하: 1.5m 이격
  if (height <= 10) {
    return 1.5
  }
  // 10m 초과: 해당 높이의 1/2 이격
  // 예: 12m → 6m, 14m → 7m, 20m → 10m
  return height / 2
}

function ViewerLoading() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-400">3D 뷰어 로딩 중...</p>
      </div>
    </div>
  )
}

// Types
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

interface LandInfo {
  pnu: string
  address: string
  area: number
  useZone: string
  maxCoverage: number
  maxFar: number
  heightLimit: number | null
  landPrice: number
  dimensions?: {
    width: number
    depth: number
  }
}

type TabType = 'config' | 'floors' | 'sunlight' | 'profit' | 'compare'

function DesignPageContent() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>('config')
  const [selectedAlternative, setSelectedAlternative] = useState(0)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [autoSunlight, setAutoSunlight] = useState(true) // 일조권 자동 적용 모드
  const [currentFloorSetbacks, setCurrentFloorSetbacks] = useState<number[]>([]) // 층별 이격거리
  const [isLoadingLand, setIsLoadingLand] = useState(true)

  // URL에서 파라미터 추출
  const pnu = searchParams.get('pnu') || ''
  const address = decodeURIComponent(searchParams.get('address') || '')

  // Land info - API에서 가져온 실제 데이터
  const [landInfo, setLandInfo] = useState<LandInfo>({
    pnu: pnu,
    address: address,
    area: 0,
    useZone: '',
    maxCoverage: 60,
    maxFar: 200,
    heightLimit: null,
    landPrice: 0,
  })

  // API에서 토지 정보 가져오기
  useEffect(() => {
    const fetchLandData = async () => {
      if (!pnu) {
        setIsLoadingLand(false)
        return
      }

      setIsLoadingLand(true)
      try {
        // 토지 상세 정보 가져오기
        const detailResponse = await landApi.getDetail(pnu)
        if (detailResponse.success && detailResponse.data) {
          const detail = detailResponse.data

          // 법규 정보 가져오기
          const regResponse = await landApi.getRegulation(pnu)
          const regulation = regResponse.success ? regResponse.data : null

          // 필지 지오메트리 가져오기 (실제 가로/세로)
          let dimensions: { width: number; depth: number } | undefined
          try {
            const geomResponse = await landApi.getGeometry(pnu)
            if (geomResponse.success && geomResponse.dimensions) {
              dimensions = geomResponse.dimensions
              console.log('Parcel geometry loaded:', dimensions)
            }
          } catch (geomError) {
            console.warn('Failed to fetch parcel geometry, using square approximation:', geomError)
          }

          setLandInfo({
            pnu: pnu,
            address: address || detail.address_jibun || '',
            area: detail.parcel_area || 0,
            useZone: detail.use_zone || '',
            maxCoverage: regulation?.coverage || 60,
            maxFar: regulation?.far || 200,
            heightLimit: regulation?.height_limit ? parseInt(regulation.height_limit) : null,
            landPrice: detail.official_land_price || 0,
            dimensions: dimensions,
          })
        }
      } catch (error) {
        console.error('Failed to fetch land data:', error)
      } finally {
        setIsLoadingLand(false)
      }
    }

    fetchLandData()
  }, [pnu, address])

  // Building alternatives - 초기값 (landInfo 로드 후 재계산됨)
  const [alternatives, setAlternatives] = useState<BuildingConfig[]>([
    {
      id: '1',
      name: '기본안',
      floors: 5,
      floorHeight: 3.3,
      setbacks: { front: 3, back: 2, left: 1.5, right: 1.5 },
      buildingArea: 0,
      totalFloorArea: 0,
      coverageRatio: 0,
      farRatio: 0,
      estimatedCost: 0,
      estimatedRevenue: 0,
    },
    {
      id: '2',
      name: '고층안',
      floors: 7,
      floorHeight: 3.0,
      setbacks: { front: 4, back: 3, left: 2, right: 2 },
      buildingArea: 0,
      totalFloorArea: 0,
      coverageRatio: 0,
      farRatio: 0,
      estimatedCost: 0,
      estimatedRevenue: 0,
    },
    {
      id: '3',
      name: '저층안',
      floors: 3,
      floorHeight: 3.5,
      setbacks: { front: 2, back: 1.5, left: 1, right: 1 },
      buildingArea: 0,
      totalFloorArea: 0,
      coverageRatio: 0,
      farRatio: 0,
      estimatedCost: 0,
      estimatedRevenue: 0,
    },
  ])

  // 토지 정보가 로드되면 건물 대안 재계산
  useEffect(() => {
    if (landInfo.area <= 0) return

    // 실제 필지 크기 사용 (없으면 정사각형 근사)
    const landWidth = landInfo.dimensions?.width || Math.sqrt(landInfo.area)
    const landDepth = landInfo.dimensions?.depth || Math.sqrt(landInfo.area)
    const COST_PER_SQM = 2500000 // 건축비 250만원/m²
    const REVENUE_PER_SQM = 3400000 // 분양가 340만원/m²

    const recalculate = (alt: BuildingConfig): BuildingConfig => {
      // 가용 면적 계산 (실제 필지 크기 기반)
      const availableWidth = landWidth - alt.setbacks.left - alt.setbacks.right
      const availableDepth = landDepth - alt.setbacks.front - alt.setbacks.back
      const buildingArea = Math.max(0, availableWidth * availableDepth)
      const totalFloorArea = buildingArea * alt.floors
      const coverageRatio = (buildingArea / landInfo.area) * 100
      const farRatio = (totalFloorArea / landInfo.area) * 100

      return {
        ...alt,
        buildingArea: Math.round(buildingArea * 10) / 10,
        totalFloorArea: Math.round(totalFloorArea * 10) / 10,
        coverageRatio: Math.round(coverageRatio * 10) / 10,
        farRatio: Math.round(farRatio * 10) / 10,
        estimatedCost: Math.round(totalFloorArea * COST_PER_SQM),
        estimatedRevenue: Math.round(totalFloorArea * REVENUE_PER_SQM),
      }
    }

    setAlternatives(prev => prev.map(recalculate))
  }, [landInfo.area, landInfo.dimensions])

  const currentBuilding = alternatives[selectedAlternative]

  const tabs = [
    { id: 'config' as TabType, label: '설계 조건', icon: '⚙️' },
    { id: 'floors' as TabType, label: '층별 면적', icon: '📊' },
    { id: 'sunlight' as TabType, label: '일조 분석', icon: '☀️' },
    { id: 'profit' as TabType, label: '수익성', icon: '💰' },
    { id: 'compare' as TabType, label: '대안 비교', icon: '📋' },
  ]

  // 대지 크기 계산 (정사각형 가정)
  const landDimensions = useMemo(() => {
    const side = Math.sqrt(landInfo.area)
    return { width: side, depth: side }
  }, [landInfo.area])

  // 층별 면적 계산 (계단형 매스)
  const calculateSteppedFloorAreas = useCallback((
    floors: number,
    floorHeight: number,
    baseSetbacks: { front: number; back: number; left: number; right: number },
    useZone: string
  ) => {
    const floorAreas: number[] = []
    const floorSetbacks: number[] = []
    const isResidential = useZone.includes('주거')

    // 가용 너비 (좌우 이격 적용)
    const availableWidth = landDimensions.width - baseSetbacks.left - baseSetbacks.right

    for (let floor = 1; floor <= floors; floor++) {
      const floorTopHeight = floor * floorHeight

      // 해당 층 상단 높이에서 필요한 북측 이격거리
      let requiredBackSetback = baseSetbacks.back
      if (isResidential) {
        requiredBackSetback = Math.max(
          calculateNorthSetback(floorTopHeight, useZone),
          MIN_SETBACKS.back
        )
      }

      floorSetbacks.push(requiredBackSetback)

      // 해당 층의 가용 깊이
      const availableDepth = landDimensions.depth - baseSetbacks.front - requiredBackSetback

      // 면적 계산 (음수 방지)
      const floorArea = Math.max(0, availableWidth * availableDepth)
      floorAreas.push(floorArea)
    }

    return { floorAreas, floorSetbacks }
  }, [landDimensions])

  // 초기 층별 이격거리 계산 (currentBuilding 변경시)
  useEffect(() => {
    const b = currentBuilding
    if (!b) return

    const isResidential = landInfo.useZone.includes('주거')

    if (autoSunlight && isResidential) {
      const baseSetbacks = {
        front: Math.max(b.setbacks.front, MIN_SETBACKS.front),
        back: MIN_SETBACKS.back,
        left: Math.max(b.setbacks.left, MIN_SETBACKS.left),
        right: Math.max(b.setbacks.right, MIN_SETBACKS.right),
      }
      const { floorSetbacks } = calculateSteppedFloorAreas(
        b.floors,
        b.floorHeight,
        baseSetbacks,
        landInfo.useZone
      )
      setCurrentFloorSetbacks(floorSetbacks)
    } else {
      setCurrentFloorSetbacks([])
    }
  }, [currentBuilding?.floors, currentBuilding?.floorHeight, autoSunlight, landInfo.useZone, calculateSteppedFloorAreas])

  const updateBuilding = (field: string, value: any) => {
    const updated = [...alternatives]
    updated[selectedAlternative] = {
      ...updated[selectedAlternative],
      [field]: value,
    }

    const b = updated[selectedAlternative]
    const buildingHeight = b.floors * b.floorHeight
    const isResidential = landInfo.useZone.includes('주거')

    // 기본 이격거리 설정
    const baseSetbacks = {
      front: Math.max(b.setbacks.front, MIN_SETBACKS.front),
      back: MIN_SETBACKS.back,  // 계단형에서는 1층 기준 최소값
      left: Math.max(b.setbacks.left, MIN_SETBACKS.left),
      right: Math.max(b.setbacks.right, MIN_SETBACKS.right),
    }

    if (autoSunlight && isResidential) {
      // 계단형 매스: 층별 면적 계산
      const { floorAreas, floorSetbacks } = calculateSteppedFloorAreas(
        b.floors,
        b.floorHeight,
        baseSetbacks,
        landInfo.useZone
      )

      // 층별 이격거리 저장 (3D 시각화용)
      setCurrentFloorSetbacks(floorSetbacks)

      // 1층 바닥면적 (건축면적)
      const groundFloorArea = floorAreas[0] || 0

      // 건폐율 제한 적용
      const maxByLaw = (landInfo.area * landInfo.maxCoverage) / 100
      b.buildingArea = Math.min(groundFloorArea, maxByLaw)

      // 총 연면적 (계단형: 각 층 면적 합계)
      let totalFloorArea = 0
      for (let i = 0; i < floorAreas.length; i++) {
        const floorArea = Math.min(floorAreas[i], maxByLaw)
        totalFloorArea += floorArea * 0.85  // 공용면적 제외
      }

      // 용적률 제한 적용
      const maxTotalFloorArea = (landInfo.area * landInfo.maxFar) / 100
      b.totalFloorArea = Math.min(totalFloorArea, maxTotalFloorArea)

      // 최대 층의 이격거리를 표시용으로 저장
      const maxSetback = Math.max(...floorSetbacks)
      b.setbacks = {
        ...baseSetbacks,
        back: maxSetback,
      }

    } else {
      // 자동 모드 OFF: 단순 계산 (계단형 아님)
      setCurrentFloorSetbacks([])  // 계단형 비활성화

      const availableWidth = landDimensions.width - b.setbacks.left - b.setbacks.right
      const availableDepth = landDimensions.depth - b.setbacks.front - b.setbacks.back
      const maxBuildingArea = Math.max(0, availableWidth * availableDepth)

      const maxByLaw = (landInfo.area * landInfo.maxCoverage) / 100
      b.buildingArea = Math.min(maxBuildingArea, maxByLaw)

      b.totalFloorArea = b.buildingArea * b.floors * 0.85

      // 용적률 제한
      const maxTotalFloorArea = (landInfo.area * landInfo.maxFar) / 100
      if (b.totalFloorArea > maxTotalFloorArea) {
        b.totalFloorArea = maxTotalFloorArea
      }
    }

    // 건폐율, 용적률 재계산
    b.coverageRatio = (b.buildingArea / landInfo.area) * 100
    b.farRatio = (b.totalFloorArea / landInfo.area) * 100

    // 음수 방지
    b.buildingArea = Math.max(0, b.buildingArea)
    b.totalFloorArea = Math.max(0, b.totalFloorArea)
    b.coverageRatio = Math.max(0, b.coverageRatio)
    b.farRatio = Math.max(0, b.farRatio)

    b.estimatedCost = b.totalFloorArea * 2500000
    b.estimatedRevenue = b.totalFloorArea * 3400000
    setAlternatives(updated)
  }

  const runAutoAnalysis = useCallback(async () => {
    setIsAnalyzing(true)
    try {
      // 여러 대안에 대해 백엔드 API 호출
      const buildingTypes = ['다가구', '다세대', '근린생활']
      const newAlternatives: BuildingConfig[] = []

      for (let i = 0; i < buildingTypes.length; i++) {
        const response = await massApi.calculate({
          pnu: landInfo.pnu,
          building_type: buildingTypes[i],
          target_floors: alternatives[i]?.floors || (i === 0 ? 5 : i === 1 ? 7 : 3),
          setbacks: alternatives[i]?.setbacks || { front: 3, back: 2, left: 1.5, right: 1.5 },
        })

        if (response.success) {
          const data = response.data
          newAlternatives.push({
            id: data.id,
            name: i === 0 ? '기본안' : i === 1 ? '고층안' : '저층안',
            floors: data.floors,
            floorHeight: data.height / data.floors,
            setbacks: alternatives[i]?.setbacks || { front: 3, back: 2, left: 1.5, right: 1.5 },
            buildingArea: data.building_area,
            totalFloorArea: data.total_floor_area,
            coverageRatio: data.coverage_ratio,
            farRatio: data.far_ratio,
            estimatedCost: data.total_floor_area * 2500000,
            estimatedRevenue: data.total_floor_area * 3400000,
          })
        }
      }

      if (newAlternatives.length > 0) {
        setAlternatives(newAlternatives)
      }
    } catch (error) {
      console.error('Auto analysis error:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [landInfo.pnu, alternatives])

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 z-20">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-white hover:text-blue-400">
              AI 건축 기획설계
            </Link>
            <span className="text-gray-500">|</span>
            <span className="text-gray-300 text-sm">{landInfo.address}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runAutoAnalysis}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm disabled:opacity-50"
            >
              {isAnalyzing ? '분석 중...' : '🤖 자동 최적화'}
            </button>
            <Link
              href={`/report?address=${encodeURIComponent(landInfo.address)}&pnu=${landInfo.pnu}&landArea=${landInfo.area}&floors=${currentBuilding.floors}&floorHeight=${currentBuilding.floorHeight}&buildingArea=${currentBuilding.buildingArea}&useZone=${encodeURIComponent(landInfo.useZone)}&maxCoverage=${landInfo.maxCoverage}&maxFar=${landInfo.maxFar}`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
            >
              📄 보고서
            </Link>
            <Link
              href="/search"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 font-medium text-sm"
            >
              토지 검색
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-96 bg-gray-800 border-r border-gray-700 flex flex-col">
          {/* Land Info Summary */}
          <div className="p-4 bg-gradient-to-r from-blue-900/50 to-gray-800 border-b border-gray-700">
            <h2 className="text-white font-bold mb-2">대지 정보</h2>
            {isLoadingLand ? (
              <div className="flex items-center gap-2 text-gray-400">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                <span>토지 정보 로딩 중...</span>
              </div>
            ) : landInfo.area > 0 ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-400">면적</span>
                  <span className="text-white ml-2">{landInfo.area.toLocaleString()}m²</span>
                </div>
                <div>
                  <span className="text-gray-400">용도</span>
                  <span className="text-white ml-2 text-xs">{landInfo.useZone || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-400">건폐율</span>
                  <span className="text-green-400 ml-2">{landInfo.maxCoverage}%</span>
                </div>
                <div>
                  <span className="text-gray-400">용적률</span>
                  <span className="text-green-400 ml-2">{landInfo.maxFar}%</span>
                </div>
              </div>
            ) : (
              <p className="text-yellow-400 text-sm">토지 정보를 불러올 수 없습니다</p>
            )}
          </div>

          {/* Alternative Selector */}
          <div className="p-4 border-b border-gray-700">
            <div className="flex gap-2">
              {alternatives.map((alt, idx) => (
                <button
                  key={alt.id}
                  onClick={() => setSelectedAlternative(idx)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    selectedAlternative === idx
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {alt.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700/50'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'config' && (
              <ConfigTab
                building={currentBuilding}
                landInfo={landInfo}
                onUpdate={updateBuilding}
                autoSunlight={autoSunlight}
                setAutoSunlight={setAutoSunlight}
              />
            )}
            {activeTab === 'floors' && (
              <FloorsTab building={currentBuilding} />
            )}
            {activeTab === 'sunlight' && (
              <SunlightTab
                building={currentBuilding}
                useZone={landInfo.useZone}
                landArea={landInfo.area}
                autoSunlight={autoSunlight}
                floorSetbacks={currentFloorSetbacks}
              />
            )}
            {activeTab === 'profit' && (
              <ProfitTab building={currentBuilding} landInfo={landInfo} />
            )}
            {activeTab === 'compare' && (
              <CompareTab alternatives={alternatives} landInfo={landInfo} />
            )}
          </div>
        </div>

        {/* 3D Viewer */}
        <div className="flex-1 relative">
          <MassViewer3D
            building={currentBuilding}
            landArea={landInfo.area}
            landDimensions={landInfo.dimensions}
            useZone={landInfo.useZone}
            showNorthSetback={true}
            floorSetbacks={currentFloorSetbacks}
          />

          {/* Quick Stats Overlay */}
          <div className="absolute top-4 right-4 bg-gray-800/90 backdrop-blur rounded-lg p-4 text-white">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400">건축면적</p>
                <p className="text-xl font-bold">{currentBuilding.buildingArea.toFixed(1)}m²</p>
              </div>
              <div>
                <p className="text-gray-400">연면적</p>
                <p className="text-xl font-bold">{currentBuilding.totalFloorArea.toFixed(1)}m²</p>
              </div>
              <div>
                <p className="text-gray-400">건폐율</p>
                <p className={`text-xl font-bold ${currentBuilding.coverageRatio > landInfo.maxCoverage ? 'text-red-400' : 'text-green-400'}`}>
                  {currentBuilding.coverageRatio.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-gray-400">용적률</p>
                <p className={`text-xl font-bold ${currentBuilding.farRatio > landInfo.maxFar ? 'text-red-400' : 'text-green-400'}`}>
                  {currentBuilding.farRatio.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Floor Indicator */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-gray-800/90 backdrop-blur rounded-lg p-2">
            {Array.from({ length: currentBuilding.floors }, (_, i) => (
              <div
                key={i}
                className="w-8 h-6 mb-1 flex items-center justify-center text-xs text-white bg-blue-600/50 rounded"
              >
                {currentBuilding.floors - i}F
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Tab Components
function ConfigTab({
  building,
  landInfo,
  onUpdate,
  autoSunlight,
  setAutoSunlight,
}: {
  building: BuildingConfig
  landInfo: LandInfo
  onUpdate: (field: string, value: any) => void
  autoSunlight: boolean
  setAutoSunlight: (value: boolean) => void
}) {
  const buildingHeight = building.floors * building.floorHeight
  const requiredNorthSetback = calculateNorthSetback(buildingHeight, landInfo.useZone)
  const isResidentialZone = landInfo.useZone.includes('주거')

  return (
    <div className="space-y-6">
      {/* 자동 일조권/이격거리 모드 */}
      {isResidentialZone && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-white font-semibold">자동 법규 적용</h3>
              <p className="text-gray-400 text-xs mt-1">일조권 사선제한 자동 반영</p>
            </div>
            <button
              onClick={() => setAutoSunlight(!autoSunlight)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                autoSunlight ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  autoSunlight ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
          {autoSunlight && (
            <div className="bg-gray-800/50 rounded p-2 mt-2 text-xs">
              <div className="flex justify-between text-gray-400">
                <span>건물 높이:</span>
                <span className="text-white">{buildingHeight.toFixed(1)}m</span>
              </div>
              <div className="flex justify-between text-gray-400 mt-1">
                <span>필요 북측 이격:</span>
                <span className="text-green-400 font-medium">{requiredNorthSetback.toFixed(1)}m</span>
              </div>
              <p className="text-gray-500 mt-2">
                층수/층고 변경시 이격거리가 자동 조정됩니다
              </p>
            </div>
          )}
        </div>
      )}

      {/* Floor Settings */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3">층수 설정</h3>
        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-sm">지상 층수</label>
            <input
              type="range"
              min="1"
              max="15"
              value={building.floors}
              onChange={(e) => onUpdate('floors', parseInt(e.target.value))}
              className="w-full mt-1"
            />
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">1층</span>
              <span className="text-blue-400 font-bold">{building.floors}층</span>
              <span className="text-gray-500">15층</span>
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-sm">층고</label>
            <input
              type="range"
              min="2.7"
              max="4.5"
              step="0.1"
              value={building.floorHeight}
              onChange={(e) => onUpdate('floorHeight', parseFloat(e.target.value))}
              className="w-full mt-1"
            />
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">2.7m</span>
              <span className="text-blue-400 font-bold">{building.floorHeight}m</span>
              <span className="text-gray-500">4.5m</span>
            </div>
          </div>
          {/* 현재 건물 높이 표시 */}
          <div className="bg-gray-800/50 rounded p-2 mt-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">총 건물 높이:</span>
              <span className="text-white font-bold">{buildingHeight.toFixed(1)}m</span>
            </div>
          </div>
        </div>
      </div>

      {/* Setback Settings */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">이격거리</h3>
          {autoSunlight && isResidentialZone && (
            <span className="text-xs bg-blue-600/50 text-blue-300 px-2 py-1 rounded">자동</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(['front', 'back', 'left', 'right'] as const).map((dir) => {
            const isAutoBack = autoSunlight && isResidentialZone && dir === 'back'
            return (
            <div key={dir}>
              <label className="text-gray-400 text-sm capitalize flex items-center gap-1">
                {dir === 'front' ? '전면' : dir === 'back' ? '후면 (북측)' : dir === 'left' ? '좌측' : '우측'}
                {isAutoBack && <span className="text-blue-400 text-xs">(일조권)</span>}
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  disabled={isAutoBack}
                  value={building.setbacks[dir]}
                  onChange={(e) =>
                    onUpdate('setbacks', {
                      ...building.setbacks,
                      [dir]: parseFloat(e.target.value),
                    })
                  }
                  className={`w-full px-2 py-1 rounded text-sm ${
                    isAutoBack
                      ? 'bg-blue-900/50 text-blue-300 border border-blue-600 cursor-not-allowed'
                      : 'bg-gray-600 text-white'
                  }`}
                />
                <span className="text-gray-400 text-sm">m</span>
              </div>
            </div>
            )
          })}
        </div>
        {/* 이격거리 요약 */}
        {autoSunlight && isResidentialZone && (
          <div className="bg-green-900/30 border border-green-700 rounded p-2 mt-3 text-xs">
            <p className="text-green-400">
              ✓ 일조권 사선제한 충족: 북측 {building.setbacks.back.toFixed(1)}m 이격
            </p>
          </div>
        )}
      </div>

      {/* Building Area & Coverage */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3">바닥면적 / 건폐율</h3>

        {/* 바닥면적 슬라이더 */}
        <div className="mb-4">
          <label className="text-gray-400 text-sm">바닥면적 (건축면적)</label>
          <input
            type="range"
            min={50}
            max={Math.floor(landInfo.area * landInfo.maxCoverage / 100)}
            value={building.buildingArea}
            onChange={(e) => {
              const newArea = parseFloat(e.target.value)
              const newCoverage = (newArea / landInfo.area) * 100
              onUpdate('coverageRatio', Math.min(newCoverage, landInfo.maxCoverage))
            }}
            className="w-full mt-1"
          />
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-500">50m²</span>
            <span className="text-blue-400 font-bold">{building.buildingArea.toFixed(1)}m²</span>
            <span className="text-gray-500">{Math.floor(landInfo.area * landInfo.maxCoverage / 100)}m²</span>
          </div>
        </div>

        {/* 건폐율 슬라이더 */}
        <div>
          <label className="text-gray-400 text-sm">건폐율</label>
          <input
            type="range"
            min="10"
            max={landInfo.maxCoverage}
            value={building.coverageRatio}
            onChange={(e) => onUpdate('coverageRatio', parseFloat(e.target.value))}
            className="w-full mt-1"
          />
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-500">10%</span>
            <span className={`font-bold ${building.coverageRatio > landInfo.maxCoverage ? 'text-red-400' : 'text-green-400'}`}>
              {building.coverageRatio.toFixed(1)}% / {landInfo.maxCoverage}%
            </span>
          </div>
        </div>

        {/* 면적 요약 */}
        <div className="bg-gray-800/50 rounded p-2 mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">대지면적:</span>
            <span className="text-white">{landInfo.area.toFixed(1)}m²</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">바닥면적:</span>
            <span className="text-blue-400">{building.buildingArea.toFixed(1)}m²</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">연면적:</span>
            <span className="text-white">{building.totalFloorArea.toFixed(1)}m²</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">용적률:</span>
            <span className={building.farRatio > landInfo.maxFar ? 'text-red-400' : 'text-green-400'}>
              {building.farRatio.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FloorsTab({ building }: { building: BuildingConfig }) {
  const floorArea = building.buildingArea * 0.85 // 공용면적 제외
  const floors = Array.from({ length: building.floors }, (_, i) => ({
    floor: i + 1,
    grossArea: building.buildingArea,
    netArea: floorArea,
    commonArea: building.buildingArea - floorArea,
  }))

  return (
    <div className="space-y-4">
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3">층별 면적표</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-600">
              <th className="py-2 text-left">층</th>
              <th className="py-2 text-right">전용</th>
              <th className="py-2 text-right">공용</th>
              <th className="py-2 text-right">계</th>
            </tr>
          </thead>
          <tbody className="text-white">
            {floors.map((f) => (
              <tr key={f.floor} className="border-b border-gray-700">
                <td className="py-2">{f.floor}층</td>
                <td className="py-2 text-right">{f.netArea.toFixed(1)}</td>
                <td className="py-2 text-right">{f.commonArea.toFixed(1)}</td>
                <td className="py-2 text-right font-medium">{f.grossArea.toFixed(1)}</td>
              </tr>
            ))}
            <tr className="bg-blue-900/30 font-bold">
              <td className="py-2">합계</td>
              <td className="py-2 text-right">{(floorArea * building.floors).toFixed(1)}</td>
              <td className="py-2 text-right">{((building.buildingArea - floorArea) * building.floors).toFixed(1)}</td>
              <td className="py-2 text-right text-blue-400">{building.totalFloorArea.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-900/30 rounded-lg p-3 text-center">
          <p className="text-gray-400 text-xs">건축면적</p>
          <p className="text-white font-bold text-lg">{building.buildingArea.toFixed(1)}m²</p>
        </div>
        <div className="bg-green-900/30 rounded-lg p-3 text-center">
          <p className="text-gray-400 text-xs">연면적</p>
          <p className="text-white font-bold text-lg">{building.totalFloorArea.toFixed(1)}m²</p>
        </div>
      </div>
    </div>
  )
}

function SunlightTab({
  building,
  useZone,
  landArea,
  autoSunlight,
  floorSetbacks
}: {
  building: BuildingConfig
  useZone: string
  landArea: number
  autoSunlight: boolean
  floorSetbacks: number[]
}) {
  const buildingHeight = building.floors * building.floorHeight
  const shadowLength = buildingHeight * 2 // 동지 기준 대략적 그림자 길이

  // 건물 크기 계산 (대지 기준)
  const landSide = Math.sqrt(landArea)
  const buildingWidth = landSide - building.setbacks.left - building.setbacks.right
  const buildingDepth = landSide - building.setbacks.front - building.setbacks.back

  // 북쪽 일조권 사선제한 계산 (정확한 법규 기준)
  const requiredSetback = calculateNorthSetback(buildingHeight, useZone)
  const currentSetback = building.setbacks.back
  const isResidentialZone = useZone.includes('주거')

  // 적합 여부 판단:
  // - 자동 법규 적용 ON: 계단형 매스로 자동 조정되므로 항상 적합
  // - 자동 법규 적용 OFF: 현재 이격거리와 필요 이격거리 비교
  const isCompliant = autoSunlight || currentSetback >= requiredSetback

  // 실제 적용된 이격거리 (자동 모드일 때는 최상층 이격거리)
  const actualSetback = autoSunlight && floorSetbacks.length > 0
    ? floorSetbacks[floorSetbacks.length - 1]
    : currentSetback

  return (
    <div className="space-y-4">
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3">일조권 분석</h3>

        <div className="space-y-4">
          {/* 정북일조 */}
          <div className={`rounded p-3 ${isCompliant ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300">정북방향 일조권 사선제한</span>
              {!isResidentialZone ? (
                <span className="px-2 py-1 bg-gray-600 text-white text-xs rounded">미적용</span>
              ) : isCompliant ? (
                <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">적합</span>
              ) : (
                <span className="px-2 py-1 bg-red-600 text-white text-xs rounded">부적합</span>
              )}
            </div>

            {!isResidentialZone ? (
              <p className="text-gray-400 text-sm">
                {useZone}은(는) 일조권 사선제한 적용 대상이 아닙니다.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                  <div>
                    <span className="text-gray-400">건물 높이:</span>
                    <span className="text-white ml-2">{buildingHeight.toFixed(1)}m</span>
                  </div>
                  <div>
                    <span className="text-gray-400">{autoSunlight ? '최상층 이격:' : '현재 이격:'}</span>
                    <span className={`ml-2 ${isCompliant ? 'text-green-400' : 'text-red-400'}`}>
                      {actualSetback.toFixed(1)}m
                    </span>
                  </div>
                </div>

                {autoSunlight && (
                  <div className="bg-blue-900/30 border border-blue-700 rounded p-2 mb-2">
                    <p className="text-blue-400 text-xs font-medium">✓ 자동 법규 적용 중</p>
                    <p className="text-gray-400 text-xs mt-1">
                      계단형 매스로 층별 이격거리가 자동 조정됩니다.
                    </p>
                    {floorSetbacks.length > 0 && (
                      <div className="mt-2 text-xs">
                        <span className="text-gray-400">층별 이격: </span>
                        {floorSetbacks.filter((s, i, arr) => i === 0 || s !== arr[i-1]).map((setback, idx) => {
                          const floorNum = floorSetbacks.indexOf(setback) + 1
                          return (
                            <span key={idx} className="text-white mr-2">
                              {floorNum}F~: {setback.toFixed(1)}m
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-gray-800/50 rounded p-2 mt-2">
                  <p className="text-blue-400 text-xs font-medium mb-1">법규 기준 (건축법 시행령 제86조)</p>
                  <p className="text-gray-400 text-xs">
                    • 10m 이하: 경계선에서 1.5m 이상 이격
                  </p>
                  <p className="text-gray-400 text-xs">
                    • 10m 초과: 경계선에서 <strong>높이÷2</strong> 이격
                  </p>
                  <p className="text-gray-400 text-xs">
                    • 사선 비율: 1:2 (수평:수직)
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    예: 12m→6m, 16m→8m, 20m→10m
                  </p>
                  {!autoSunlight && (
                    <p className="text-white text-sm mt-1">
                      → 필요 이격거리: <strong>{requiredSetback.toFixed(1)}m</strong>
                      {buildingHeight > 10 && <span className="text-gray-400 ml-1">({buildingHeight.toFixed(1)}÷2)</span>}
                    </p>
                  )}
                </div>

                {!isCompliant && !autoSunlight && (
                  <div className="bg-red-900/50 rounded p-2 mt-2">
                    <p className="text-red-400 text-xs">
                      ⚠️ 후면 이격거리를 {(requiredSetback - currentSetback).toFixed(1)}m 더 확보해야 합니다.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 인접대지 일조 */}
          <div className="bg-gray-600/50 rounded p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300">인접대지 일조권</span>
              <span className="px-2 py-1 bg-yellow-600 text-white text-xs rounded">검토필요</span>
            </div>
            <p className="text-gray-400 text-sm">
              건물 높이: {buildingHeight.toFixed(1)}m
            </p>
            <p className="text-gray-400 text-sm">
              동지 그림자 길이: 약 {shadowLength.toFixed(1)}m
            </p>
          </div>
        </div>
      </div>

      {/* Shadow Diagram */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3">일영 다이어그램</h3>
        <ShadowDiagram
          buildingWidth={Math.max(5, buildingWidth)}
          buildingDepth={Math.max(5, buildingDepth)}
          buildingHeight={buildingHeight}
          latitude={33.5}
        />
      </div>
    </div>
  )
}

function ProfitTab({ building, landInfo }: { building: BuildingConfig; landInfo: LandInfo }) {
  const landCost = landInfo.area * landInfo.landPrice
  const constructionCost = building.estimatedCost
  const totalCost = landCost + constructionCost
  const revenue = building.estimatedRevenue
  const profit = revenue - totalCost
  const profitRate = (profit / totalCost) * 100

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className={`rounded-lg p-4 ${profit > 0 ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
        <h3 className="text-white font-semibold mb-2">수익성 요약</h3>
        <div className="text-3xl font-bold text-white mb-1">
          {profit > 0 ? '+' : ''}{(profit / 100000000).toFixed(1)}억원
        </div>
        <p className={`text-sm ${profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
          수익률 {profitRate.toFixed(1)}%
        </p>
      </div>

      {/* Cost Breakdown */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3">비용 상세</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-gray-600">
            <span className="text-gray-400">토지비</span>
            <span className="text-white">{(landCost / 100000000).toFixed(1)}억원</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-600">
            <span className="text-gray-400">건축비 (평당 825만원)</span>
            <span className="text-white">{(constructionCost / 100000000).toFixed(1)}억원</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-600">
            <span className="text-gray-400">기타 비용 (10%)</span>
            <span className="text-white">{(totalCost * 0.1 / 100000000).toFixed(1)}억원</span>
          </div>
          <div className="flex justify-between py-2 font-bold">
            <span className="text-white">총 사업비</span>
            <span className="text-blue-400">{(totalCost * 1.1 / 100000000).toFixed(1)}억원</span>
          </div>
        </div>
      </div>

      {/* Revenue */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3">예상 수익</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-gray-600">
            <span className="text-gray-400">분양가 (평당 1,120만원)</span>
            <span className="text-white">{(revenue / 100000000).toFixed(1)}억원</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-600">
            <span className="text-gray-400">분양 면적</span>
            <span className="text-white">{(building.totalFloorArea / 3.3).toFixed(0)}평</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CompareTab({ alternatives, landInfo }: { alternatives: BuildingConfig[]; landInfo: LandInfo }) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-700/50 rounded-lg p-4 overflow-x-auto">
        <h3 className="text-white font-semibold mb-3">대안 비교</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-600">
              <th className="py-2 text-left">항목</th>
              {alternatives.map((alt) => (
                <th key={alt.id} className="py-2 text-center">{alt.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-white">
            <tr className="border-b border-gray-700">
              <td className="py-2 text-gray-400">층수</td>
              {alternatives.map((alt) => (
                <td key={alt.id} className="py-2 text-center">{alt.floors}층</td>
              ))}
            </tr>
            <tr className="border-b border-gray-700">
              <td className="py-2 text-gray-400">건축면적</td>
              {alternatives.map((alt) => (
                <td key={alt.id} className="py-2 text-center">{alt.buildingArea.toFixed(0)}m²</td>
              ))}
            </tr>
            <tr className="border-b border-gray-700">
              <td className="py-2 text-gray-400">연면적</td>
              {alternatives.map((alt) => (
                <td key={alt.id} className="py-2 text-center">{alt.totalFloorArea.toFixed(0)}m²</td>
              ))}
            </tr>
            <tr className="border-b border-gray-700">
              <td className="py-2 text-gray-400">건폐율</td>
              {alternatives.map((alt) => (
                <td key={alt.id} className={`py-2 text-center ${alt.coverageRatio > landInfo.maxCoverage ? 'text-red-400' : 'text-green-400'}`}>
                  {alt.coverageRatio.toFixed(1)}%
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-700">
              <td className="py-2 text-gray-400">용적률</td>
              {alternatives.map((alt) => (
                <td key={alt.id} className={`py-2 text-center ${alt.farRatio > landInfo.maxFar ? 'text-red-400' : 'text-green-400'}`}>
                  {alt.farRatio.toFixed(1)}%
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-700">
              <td className="py-2 text-gray-400">사업비</td>
              {alternatives.map((alt) => (
                <td key={alt.id} className="py-2 text-center">{(alt.estimatedCost / 100000000).toFixed(0)}억</td>
              ))}
            </tr>
            <tr className="bg-blue-900/30">
              <td className="py-2 text-white font-medium">예상 수익</td>
              {alternatives.map((alt) => {
                const profit = alt.estimatedRevenue - alt.estimatedCost
                return (
                  <td key={alt.id} className={`py-2 text-center font-bold ${profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {profit > 0 ? '+' : ''}{(profit / 100000000).toFixed(0)}억
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DesignPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      }
    >
      <DesignPageContent />
    </Suspense>
  )
}
