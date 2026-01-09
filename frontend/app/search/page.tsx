'use client'

import { useState, useEffect, Suspense, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { landApi, LandDetail, Regulation, MassResult, BuildingInfo } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { SelectedParcel, ParcelInfo } from '@/components/Map/KakaoMap'

const KakaoMap = dynamic(
  () => import('@/components/Map/KakaoMap').then((mod) => mod.KakaoMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    ),
  }
)

// 섹션 타입
type SectionType = 'land' | 'building' | 'regulation'

// 최근 본 토지 타입
interface RecentLand {
  pnu: string
  address: string
  lat: number
  lng: number
  viewedAt: number
}

// 로컬스토리지 키
const RECENT_LANDS_KEY = 'recent_viewed_lands'

// 최근 본 토지 저장 (최대 5개)
function saveRecentLand(land: RecentLand) {
  try {
    const stored = localStorage.getItem(RECENT_LANDS_KEY)
    let lands: RecentLand[] = stored ? JSON.parse(stored) : []
    lands = lands.filter(l => l.pnu !== land.pnu)
    lands.unshift(land)
    lands = lands.slice(0, 5)
    localStorage.setItem(RECENT_LANDS_KEY, JSON.stringify(lands))
  } catch (e) {
    console.error('Failed to save recent land:', e)
  }
}

// 최근 본 토지 불러오기
function getRecentLands(): RecentLand[] {
  try {
    const stored = localStorage.getItem(RECENT_LANDS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (e) {
    return []
  }
}

// 필지 상세 정보 타입
interface ParcelDetail extends LandDetail {
  regulation?: Regulation | null
  regulationError?: boolean
}

function SearchPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showResults, setShowResults] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingLand, setIsLoadingLand] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [viewMode, setViewMode] = useState<'map' | 'roadview'>('map')
  const [recentLands, setRecentLands] = useState<RecentLand[]>([])
  const [activeSection, setActiveSection] = useState<SectionType>('land')

  // 다중 선택 상태
  const [selectedParcels, setSelectedParcels] = useState<SelectedParcel[]>([])
  const [parcelDetails, setParcelDetails] = useState<Map<string, ParcelDetail>>(new Map())
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)

  const { setMapCenter, mapCenter } = useAppStore()

  // 섹션 refs
  const landRef = useRef<HTMLDivElement>(null)
  const buildingRef = useRef<HTMLDivElement>(null)
  const regulationRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // 최근 본 토지 불러오기
  useEffect(() => {
    setRecentLands(getRecentLands())
  }, [])

  // URL 쿼리 파라미터 처리
  useEffect(() => {
    const q = searchParams.get('q')
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')

    if (q) {
      setSearchQuery(q)
      handleSearch(q)
    }
    if (lat && lng) {
      setMapCenter({ lat: parseFloat(lat), lng: parseFloat(lng) })
    }
  }, [searchParams])

  // 스크롤 시 활성 섹션 감지
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || selectedParcels.length === 0) return

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect()
      const containerTop = containerRect.top

      const landRect = landRef.current?.getBoundingClientRect()
      const buildingRect = buildingRef.current?.getBoundingClientRect()
      const regulationRect = regulationRef.current?.getBoundingClientRect()

      const threshold = containerTop + 150

      if (regulationRect && regulationRect.top <= threshold) {
        setActiveSection('regulation')
      } else if (buildingRect && buildingRect.top <= threshold) {
        setActiveSection('building')
      } else {
        setActiveSection('land')
      }
    }

    container.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => container.removeEventListener('scroll', handleScroll)
  }, [selectedParcels])

  // ESC 키로 선택 초기화
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedParcels.length > 0) {
          setSelectedParcels([])
          setParcelDetails(new Map())
          setIsMultiSelectMode(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedParcels])

  // 섹션으로 스크롤
  const scrollToSection = (section: SectionType) => {
    const refs = {
      land: landRef,
      building: buildingRef,
      regulation: regulationRef,
    }
    refs[section].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 필지 상세 정보 로드
  const loadParcelDetail = useCallback(async (parcel: ParcelInfo) => {
    if (parcelDetails.has(parcel.pnu)) return // 이미 로드됨

    setIsLoadingLand(true)

    try {
      // 기본 정보로 먼저 업데이트
      const basicDetail: ParcelDetail = {
        pnu: parcel.pnu,
        address_jibun: parcel.address_jibun,
        address_road: '',
        latitude: parcel.latitude,
        longitude: parcel.longitude,
        parcel_area: null,
        use_zone: '',
        official_land_price: null,
        regulation: null,
      }

      setParcelDetails(prev => new Map(prev).set(parcel.pnu, basicDetail))

      // 상세 정보 조회
      const landResult = await landApi.getDetail(parcel.pnu, parcel.longitude, parcel.latitude)
      if (landResult.success && landResult.data) {
        const detail: ParcelDetail = {
          ...landResult.data,
          address_jibun: parcel.address_jibun || landResult.data.address_jibun,
          regulation: null,
        }
        setParcelDetails(prev => new Map(prev).set(parcel.pnu, detail))
      }

      // 법규 정보 조회
      try {
        const regResult = await landApi.getRegulation(parcel.pnu)
        if (regResult.success && regResult.data) {
          setParcelDetails(prev => {
            const current = prev.get(parcel.pnu)
            if (current) {
              return new Map(prev).set(parcel.pnu, { ...current, regulation: regResult.data, regulationError: false })
            }
            return prev
          })
        } else {
          // API 실패 시 에러 표시
          setParcelDetails(prev => {
            const current = prev.get(parcel.pnu)
            if (current) {
              return new Map(prev).set(parcel.pnu, { ...current, regulationError: true })
            }
            return prev
          })
        }
      } catch (error) {
        console.error('Failed to get regulation:', error)
        setParcelDetails(prev => {
          const current = prev.get(parcel.pnu)
          if (current) {
            return new Map(prev).set(parcel.pnu, { ...current, regulationError: true })
          }
          return prev
        })
      }
    } catch (error) {
      console.error('Failed to get land detail:', error)
    } finally {
      setIsLoadingLand(false)
    }
  }, [parcelDetails])

  // 검색 결과로 필지 선택
  const selectParcelFromSearchResult = useCallback(async (result: any) => {
    // 검색 결과에 PNU가 있는 경우 사용
    const pnu = result.pnu
    if (!pnu) {
      console.log('No PNU in search result')
      return false
    }

    const parcelInfo: ParcelInfo = {
      pnu: pnu,
      address_jibun: result.address || result.title || '',
      latitude: result.y,
      longitude: result.x,
    }

    // 필지 선택 및 상세 정보 로드
    setSidebarOpen(true)
    setSelectedParcels([parcelInfo])
    setParcelDetails(new Map())

    // 최근 본 토지에 저장
    if (parcelInfo.pnu && parcelInfo.address_jibun) {
      saveRecentLand({
        pnu: parcelInfo.pnu,
        address: parcelInfo.address_jibun,
        lat: result.y,
        lng: result.x,
        viewedAt: Date.now()
      })
      setRecentLands(getRecentLands())
    }

    // 상세 정보 로드
    await loadParcelDetail(parcelInfo)
    return true
  }, [loadParcelDetail])

  // 주소 검색
  const handleSearch = useCallback(async (query: string, autoNavigate: boolean = true) => {
    if (!query.trim()) return

    setIsSearching(true)
    try {
      const result = await landApi.search(query)
      if (result.success && result.data && result.data.length > 0) {
        setSearchResults(result.data)

        // 자동 이동: 첫 번째 결과로 바로 이동
        if (autoNavigate) {
          const firstResult = result.data[0]
          setMapCenter({ lat: firstResult.y, lng: firstResult.x })
          setSearchQuery(firstResult.address || firstResult.title)
          setShowResults(false)

          // 검색 결과에서 필지 정보 가져와서 선택
          await selectParcelFromSearchResult(firstResult)
        } else {
          setShowResults(true)
        }
      } else {
        setShowResults(true)
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsSearching(false)
    }
  }, [setMapCenter, selectParcelFromSearchResult])

  // 검색 결과 클릭
  const handleResultClick = async (result: any) => {
    setMapCenter({ lat: result.y, lng: result.x })
    setShowResults(false)
    setSearchQuery(result.address || result.title)

    // 검색 결과에서 필지 정보 가져와서 선택
    await selectParcelFromSearchResult(result)
  }

  // 필지 클릭 핸들러 (다중 선택 지원)
  const handleParcelClick = useCallback(async (parcel: ParcelInfo, isMultiSelect: boolean) => {
    console.log('Parcel clicked:', parcel, 'Multi:', isMultiSelect)
    if (!parcel) return

    setSidebarOpen(true)

    // 다중 선택 모드
    if (isMultiSelect) {
      setSelectedParcels(prev => {
        // 이미 선택된 필지인지 확인
        const existingIndex = prev.findIndex(p => p.pnu === parcel.pnu)
        if (existingIndex >= 0) {
          // 이미 선택된 경우 제거
          return prev.filter(p => p.pnu !== parcel.pnu)
        } else {
          // 새로 추가 (최대 5개)
          if (prev.length >= 5) {
            alert('최대 5개까지 선택할 수 있습니다.')
            return prev
          }
          return [...prev, parcel]
        }
      })
    } else {
      // 단일 선택 모드 - 기존 선택 초기화하고 새로 선택
      setSelectedParcels([parcel])
      setParcelDetails(new Map())
    }

    // 최근 본 토지에 저장
    if (parcel.pnu && parcel.address_jibun) {
      saveRecentLand({
        pnu: parcel.pnu,
        address: parcel.address_jibun,
        lat: parcel.latitude,
        lng: parcel.longitude,
        viewedAt: Date.now()
      })
      setRecentLands(getRecentLands())
    }

    // 상세 정보 로드
    await loadParcelDetail(parcel)
  }, [loadParcelDetail])

  // 선택 초기화
  const handleClearSelection = useCallback(() => {
    setSelectedParcels([])
    setParcelDetails(new Map())
  }, [])

  // 합산 정보 계산
  const getTotalInfo = useCallback(() => {
    let totalArea = 0
    let totalPrice = 0
    let maxCoverage = 0
    let maxFar = 0

    selectedParcels.forEach(p => {
      const detail = parcelDetails.get(p.pnu)
      if (detail) {
        if (detail.parcel_area) totalArea += detail.parcel_area
        if (detail.official_land_price && detail.parcel_area) {
          totalPrice += detail.official_land_price * detail.parcel_area
        }
        if (detail.regulation) {
          maxCoverage = Math.max(maxCoverage, detail.regulation.coverage || 0)
          maxFar = Math.max(maxFar, detail.regulation.far || 0)
        }
      }
    })

    return { totalArea, totalPrice, maxCoverage, maxFar }
  }, [selectedParcels, parcelDetails])

  const sections = [
    { id: 'land' as SectionType, label: '토지', icon: '🏞️' },
    { id: 'building' as SectionType, label: '건물', icon: '🏢' },
    { id: 'regulation' as SectionType, label: '법규/설계', icon: '📋' },
  ]

  const totalInfo = getTotalInfo()
  const primaryParcel = selectedParcels[0]
  const primaryDetail = primaryParcel ? parcelDetails.get(primaryParcel.pnu) : null

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? 'w-[400px]' : 'w-0'
          } transition-all duration-300 bg-white shadow-xl overflow-hidden flex flex-col z-20`}
        >
          {/* Header */}
          <div className="flex items-center gap-2 p-3 border-b bg-white">
            <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <span className="font-semibold text-gray-800">
              {selectedParcels.length > 1 ? `${selectedParcels.length}개 필지 선택` : '토지 정보'}
            </span>
            {selectedParcels.length > 0 && (
              <button
                onClick={handleClearSelection}
                className="ml-auto text-sm text-gray-500 hover:text-gray-700"
              >
                초기화
              </button>
            )}
          </div>

          {selectedParcels.length > 0 ? (
            <>
              {/* Address Header */}
              <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-white">
                {selectedParcels.length === 1 ? (
                  <>
                    <h1 className="text-lg font-bold text-gray-900 mb-1">
                      {primaryParcel?.address_jibun || '주소 로딩 중...'}
                    </h1>
                    {primaryDetail?.use_zone && (
                      <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                        {primaryDetail.use_zone}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <h1 className="text-lg font-bold text-gray-900 mb-2">
                      필지 합병 검토
                    </h1>
                    <div className="flex flex-wrap gap-1">
                      {selectedParcels.map((p, i) => (
                        <span
                          key={p.pnu}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            i === 0 ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          <span className="w-4 h-4 rounded-full bg-current text-white flex items-center justify-center text-xs" style={{ backgroundColor: i === 0 ? '#3b82f6' : '#10b981' }}>
                            {i + 1}
                          </span>
                          {p.address_jibun.split(' ').pop()}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {isLoadingLand && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    상세 정보 로딩 중...
                  </div>
                )}
              </div>

              {/* 다중 선택 시 합산 정보 */}
              {selectedParcels.length > 1 && (
                <div className="p-4 bg-blue-50 border-b">
                  <h3 className="text-sm font-bold text-blue-800 mb-3">📊 합산 정보</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-lg p-3">
                      <p className="text-xs text-gray-500">총 면적</p>
                      <p className="text-lg font-bold text-blue-600">
                        {totalInfo.totalArea > 0 ? `${totalInfo.totalArea.toLocaleString()}m²` : '-'}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <p className="text-xs text-gray-500">예상 토지가</p>
                      <p className="text-lg font-bold text-blue-600">
                        {totalInfo.totalPrice > 0 ? `${(totalInfo.totalPrice / 100000000).toFixed(1)}억` : '-'}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <p className="text-xs text-gray-500">건폐율 (최대)</p>
                      <p className="text-lg font-bold text-green-600">
                        {totalInfo.maxCoverage > 0 ? `${totalInfo.maxCoverage}%` : '-'}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <p className="text-xs text-gray-500">용적률 (최대)</p>
                      <p className="text-lg font-bold text-green-600">
                        {totalInfo.maxFar > 0 ? `${totalInfo.maxFar}%` : '-'}
                      </p>
                    </div>
                  </div>
                  {totalInfo.totalArea > 0 && totalInfo.maxCoverage > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="p-3 bg-white rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">예상 최대 건축면적</p>
                        <p className="text-xl font-bold text-blue-600">
                          {(totalInfo.totalArea * totalInfo.maxCoverage / 100).toLocaleString()}m²
                        </p>
                      </div>
                      <div className="p-3 bg-white rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">예상 최대 연면적</p>
                        <p className="text-xl font-bold text-purple-600">
                          {(totalInfo.totalArea * totalInfo.maxFar / 100).toLocaleString()}m²
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section Navigation - Sticky */}
              <div className="flex border-b bg-white sticky top-0 z-10">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`flex-1 py-3 text-sm font-medium transition-all border-b-2 ${
                      activeSection === section.id
                        ? 'text-blue-600 border-blue-600 bg-blue-50'
                        : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="mr-1">{section.icon}</span>
                    {section.label}
                  </button>
                ))}
              </div>

              {/* Scrollable Content */}
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scroll-smooth">
                {/* 토지 정보 섹션 */}
                <div ref={landRef} className="p-4 border-b-8 border-gray-100">
                  <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="text-lg">🏞️</span> 토지 정보
                    {selectedParcels.length > 1 && (
                      <span className="text-sm font-normal text-gray-500">({selectedParcels.length}개 필지)</span>
                    )}
                  </h3>

                  {/* 개별 필지 정보 */}
                  {selectedParcels.map((parcel, index) => {
                    const detail = parcelDetails.get(parcel.pnu)
                    return (
                      <div key={parcel.pnu} className={`${index > 0 ? 'mt-4 pt-4 border-t' : ''}`}>
                        {selectedParcels.length > 1 && (
                          <div className="flex items-center gap-2 mb-3">
                            <span
                              className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold"
                              style={{ backgroundColor: index === 0 ? '#3b82f6' : '#10b981' }}
                            >
                              {index + 1}
                            </span>
                            <span className="text-sm font-medium text-gray-700">{parcel.address_jibun}</span>
                          </div>
                        )}
                        <div className="space-y-2">
                          <InfoRow label="PNU" value={parcel.pnu || '-'} />
                          {selectedParcels.length === 1 && (
                            <InfoRow label="지번주소" value={parcel.address_jibun || '-'} />
                          )}
                          <InfoRow
                            label="대지면적"
                            value={detail?.parcel_area ? `${detail.parcel_area.toLocaleString()}m²` : '-'}
                            highlight
                          />
                          <InfoRow label="용도지역" value={detail?.use_zone || '-'} />
                          {detail?.use_zones && detail.use_zones.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <p className="text-xs text-gray-500 mb-2">토지이용계획</p>
                              <div className="flex flex-wrap gap-1.5">
                                {detail.use_zones.map((zone, zIdx) => (
                                  <span
                                    key={zIdx}
                                    className="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md"
                                  >
                                    {zone.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <InfoRow
                            label="공시지가"
                            value={detail?.official_land_price ? `${detail.official_land_price.toLocaleString()}원/m²` : '-'}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 건물 정보 섹션 */}
                <div ref={buildingRef} className="p-4 border-b-8 border-gray-100">
                  <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="text-lg">🏢</span> 건물 정보
                  </h3>
                  {primaryDetail?.building?.exists && primaryDetail.building.buildings.length > 0 ? (
                    <div className="space-y-3">
                      {primaryDetail.building.buildings.map((bldg, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-xl p-4">
                          {bldg.name && bldg.name.trim() && (
                            <p className="font-semibold text-gray-900 mb-2">{bldg.name}</p>
                          )}
                          <div className="space-y-2">
                            <InfoRow label="주용도" value={bldg.main_purpose || '-'} highlight />
                            {bldg.etc_purpose && <InfoRow label="기타용도" value={bldg.etc_purpose} />}
                            <InfoRow label="구조" value={bldg.structure || '-'} />
                            <InfoRow label="대지면적" value={bldg.plat_area ? `${bldg.plat_area.toLocaleString()}m²` : '-'} />
                            <InfoRow label="건축면적" value={bldg.building_area ? `${bldg.building_area.toLocaleString()}m²` : '-'} />
                            <InfoRow label="연면적" value={bldg.total_area ? `${bldg.total_area.toLocaleString()}m²` : '-'} />
                            <InfoRow label="용적률산정연면적" value={bldg.vl_rat_estm_area ? `${bldg.vl_rat_estm_area.toLocaleString()}m²` : '-'} />
                            <InfoRow label="건폐율" value={bldg.bc_rat ? `${bldg.bc_rat.toFixed(2)}%` : '-'} highlight />
                            <InfoRow label="용적률" value={bldg.vl_rat ? `${bldg.vl_rat.toFixed(2)}%` : '-'} highlight />
                            <InfoRow label="높이" value={bldg.height ? `${bldg.height}m` : '-'} />
                            <InfoRow label="층수" value={`지상 ${bldg.floors.above}층${bldg.floors.below > 0 ? `, 지하 ${bldg.floors.below}층` : ''}`} />
                            <InfoRow label="세대수" value={bldg.household_count ? `${bldg.household_count}세대` : '-'} />
                            <InfoRow label="주차대수" value={(bldg.parking?.total || bldg.parking_count) ? `${bldg.parking?.total || bldg.parking_count}대` : '-'} />
                            <InfoRow label="사용승인일" value={bldg.approval_date ? `${bldg.approval_date.slice(0,4)}-${bldg.approval_date.slice(4,6)}-${bldg.approval_date.slice(6,8)}` : '-'} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-6 text-center">
                      <div className="text-4xl mb-3 opacity-50">🏗️</div>
                      <p className="text-gray-500 text-sm">
                        {selectedParcels.length > 1
                          ? '합병 후 신규 건축 가능'
                          : '이 필지에 건물 정보가 없습니다.'}
                      </p>
                      <p className="text-gray-400 text-xs mt-1">건축물대장 정보가 등록되면 표시됩니다.</p>
                    </div>
                  )}
                </div>

                {/* 법규/설계 섹션 */}
                <div ref={regulationRef} className="p-4">
                  <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="text-lg">📋</span> 법규/설계
                  </h3>

                  {selectedParcels.map((parcel, index) => {
                    const detail = parcelDetails.get(parcel.pnu)
                    const regulation = detail?.regulation

                    return (
                      <div key={parcel.pnu} className={`${index > 0 ? 'mt-4 pt-4 border-t' : ''}`}>
                        {selectedParcels.length > 1 && (
                          <div className="flex items-center gap-2 mb-3">
                            <span
                              className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold"
                              style={{ backgroundColor: index === 0 ? '#3b82f6' : '#10b981' }}
                            >
                              {index + 1}
                            </span>
                            <span className="text-sm font-medium text-gray-700">{parcel.address_jibun.split(' ').pop()}</span>
                          </div>
                        )}

                        {regulation ? (
                          <div className="space-y-2">
                            <InfoRow label="용도지역" value={regulation.use_zone} />
                            <InfoRow label="건폐율" value={`${regulation.coverage}%`} highlight />
                            <InfoRow label="용적률" value={`${regulation.far}%`} highlight />
                            <InfoRow label="높이제한" value={regulation.height_limit || '제한없음'} />
                            <InfoRow label="정북이격" value={`${regulation.north_setback}m`} />
                            {regulation.note && (
                              <div className="mt-2 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
                                <p className="text-xs text-yellow-800">{regulation.note}</p>
                              </div>
                            )}
                          </div>
                        ) : detail?.regulationError ? (
                          <div className="bg-red-50 rounded-xl p-6 text-center">
                            <div className="text-3xl mb-2">⚠️</div>
                            <p className="text-red-600 text-sm font-medium">법규 정보를 불러올 수 없습니다</p>
                            <p className="text-gray-400 text-xs mt-1">잠시 후 다시 시도해주세요</p>
                          </div>
                        ) : (
                          <div className="bg-gray-50 rounded-xl p-6 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
                            <p className="text-gray-500 text-sm">법규 정보를 불러오는 중...</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 하단 여백 */}
                <div className="h-24" />
              </div>

              {/* 설계 시뮬레이션 버튼 - Fixed */}
              <div className="p-4 border-t bg-white shadow-lg">
                <Link
                  href={`/design?pnu=${selectedParcels.map(p => p.pnu).join(',')}&address=${encodeURIComponent(
                    selectedParcels.length === 1
                      ? primaryParcel?.address_jibun || ''
                      : `${selectedParcels.length}개 필지 합병`
                  )}&totalArea=${totalInfo.totalArea}`}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span>
                    {selectedParcels.length > 1 ? '합병 설계 시뮬레이션' : '설계 시뮬레이션'}
                  </span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto">
              {/* 최근 본 토지 */}
              {recentLands.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    최근 본 토지
                  </h3>
                  <div className="space-y-2">
                    {recentLands.map((land, idx) => (
                      <button
                        key={land.pnu}
                        onClick={() => {
                          // 지도 중심 이동
                          setMapCenter({ lat: land.lat, lng: land.lng })
                          // 필지 선택
                          handleParcelClick({
                            address_jibun: land.address,
                            pnu: land.pnu,
                            latitude: land.lat,
                            longitude: land.lng,
                          }, false)
                        }}
                        className="w-full text-left p-3 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium flex-shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                              {land.address}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {new Date(land.viewedAt).toLocaleDateString('ko-KR', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 안내 메시지 */}
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                <div className="text-5xl mb-4">🗺️</div>
                <p className="text-lg font-medium mb-2">지도에서 필지를 클릭하세요</p>
                <p className="text-sm text-center text-gray-400 mb-4">
                  토지 정보, 건물 정보, 법규 검토,<br />
                  설계 시뮬레이션을 확인할 수 있습니다.
                </p>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-sm text-green-700">
                    지도 우측 <span className="inline-flex items-center justify-center w-6 h-6 bg-green-200 rounded">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                      </svg>
                    </span> 버튼으로<br />
                    <span className="font-medium">다중 필지 선택</span> 가능
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Toggle Sidebar Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-white shadow-lg rounded-r-lg p-2 hover:bg-gray-100"
          style={{ left: sidebarOpen ? '400px' : '0' }}
        >
          <svg
            className={`w-4 h-4 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Map Area */}
        <div className="flex-1 relative">
          {/* Top Controls */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full p-1 shadow-lg">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                placeholder="주소 검색..."
                className="w-72 px-4 py-2 bg-transparent border-none focus:outline-none"
              />
              <button
                onClick={() => handleSearch(searchQuery, false)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-full"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {/* Search Results Dropdown */}
              {showResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl max-h-64 overflow-y-auto z-50">
                  {searchResults.map((result, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleResultClick(result)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0"
                    >
                      <p className="font-medium text-gray-900">{result.title || result.address}</p>
                      {result.road_address && (
                        <p className="text-sm text-gray-500">{result.road_address}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Map Type Toggle */}
            <div className="flex rounded-full overflow-hidden">
              <button
                onClick={() => setViewMode('map')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'map' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                지도
              </button>
              <button
                onClick={() => setViewMode('roadview')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'roadview' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                로드뷰
              </button>
            </div>
          </div>

          {/* Map */}
          <KakaoMap
            onParcelClick={handleParcelClick}
            onMultiSelectChange={setSelectedParcels}
            selectedParcels={selectedParcels}
            viewMode={viewMode}
            isMultiSelectMode={isMultiSelectMode}
            onMultiSelectModeChange={setIsMultiSelectMode}
            center={mapCenter}
          />

          {/* Coordinates Display */}
          <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur rounded-lg shadow px-3 py-2 text-sm text-gray-600 z-10">
            {mapCenter.lat.toFixed(6)}, {mapCenter.lng.toFixed(6)}
          </div>
        </div>
      </div>
    </div>
  )
}

// 정보 행 컴포넌트
function InfoRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 px-3 bg-gray-50 rounded-lg">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className={`text-sm font-medium text-right max-w-[60%] break-all ${highlight ? 'text-blue-600' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  )
}
