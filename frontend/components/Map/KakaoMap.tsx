'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

declare global {
  interface Window { kakao: any }
}

export interface ParcelInfo {
  address_jibun: string
  pnu: string
  latitude: number
  longitude: number
}

// 선택된 필지 정보 (면적 포함)
export interface SelectedParcel extends ParcelInfo {
  area?: number
}

// 지도 설정 타입
export interface MapSettings {
  mapType: 'map' | 'skyview' | 'hybrid'
  showTerrain: boolean
  showCadastral: boolean
  showDistrict: boolean
  showRoadview: boolean
}

interface KakaoMapProps {
  onParcelClick?: (parcel: ParcelInfo, isMultiSelect: boolean) => void
  onMultiSelectChange?: (parcels: SelectedParcel[]) => void
  selectedParcels?: SelectedParcel[]
  viewMode?: 'map' | 'roadview'
  mapSettings?: MapSettings
  onMapSettingsChange?: (settings: MapSettings) => void
  isMultiSelectMode?: boolean
  onMultiSelectModeChange?: (mode: boolean) => void
  center?: { lat: number; lng: number }
}

const defaultSettings: MapSettings = {
  mapType: 'map',
  showTerrain: false,
  showCadastral: true,
  showDistrict: false,
  showRoadview: false,
}

export function KakaoMap({
  onParcelClick,
  onMultiSelectChange,
  selectedParcels = [],
  viewMode = 'map',
  mapSettings = defaultSettings,
  onMapSettingsChange,
  isMultiSelectMode = false,
  onMultiSelectModeChange,
  center
}: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const roadviewRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const roadviewInstanceRef = useRef<any>(null)
  const roadviewClientRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const selectedMarkersRef = useRef<any[]>([])
  const viewModeRef = useRef(viewMode)
  const multiSelectModeRef = useRef(isMultiSelectMode)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [roadviewError, setRoadviewError] = useState<string | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [localSettings, setLocalSettings] = useState<MapSettings>(mapSettings)
  const [isLocating, setIsLocating] = useState(false)
  const [isRoadviewActive, setIsRoadviewActive] = useState(false)
  const [measureMode, setMeasureMode] = useState<'none' | 'distance' | 'area' | 'radius'>('none')
  const [showLegend, setShowLegend] = useState(false)
  const [mapLevel, setMapLevel] = useState(3)
  const measureObjectsRef = useRef<any[]>([])
  const measureOverlaysRef = useRef<any[]>([])
  const drawingLineRef = useRef<any>(null)
  const drawingPolygonRef = useRef<any>(null)
  const drawingCircleRef = useRef<any>(null)
  const measurePointsRef = useRef<any[]>([])
  const measureModeRef = useRef<'none' | 'distance' | 'area' | 'radius'>('none')
  const radiusCenterRef = useRef<any>(null)
  const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY

  // 선택된 필지들의 마커 업데이트
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current) return

    // 기존 마커들 제거
    selectedMarkersRef.current.forEach(marker => marker.setMap(null))
    selectedMarkersRef.current = []

    // 새 마커들 생성
    selectedParcels.forEach((parcel, index) => {
      const position = new window.kakao.maps.LatLng(parcel.latitude, parcel.longitude)

      // 마커 생성
      const marker = new window.kakao.maps.Marker({
        position,
        map: mapInstanceRef.current,
        zIndex: 5,
      })
      selectedMarkersRef.current.push(marker)

      // 번호 오버레이
      const content = `
        <div style="
          background: ${index === 0 ? '#3b82f6' : '#10b981'};
          color: white;
          padding: 6px 10px;
          border-radius: 16px;
          font-size: 13px;
          font-weight: bold;
          border: 2px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ">${index + 1}</div>
      `
      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content,
        yAnchor: 2.5,
        zIndex: 10,
      })
      overlay.setMap(mapInstanceRef.current)
      selectedMarkersRef.current.push(overlay)
    })
  }, [selectedParcels, isMapReady])

  // 현위치로 이동
  const moveToCurrentLocation = useCallback(() => {
    if (!mapInstanceRef.current) return

    setIsLocating(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          const locPosition = new window.kakao.maps.LatLng(lat, lng)
          mapInstanceRef.current.setCenter(locPosition)
          mapInstanceRef.current.setLevel(3)
          setIsLocating(false)
        },
        (error) => {
          console.error('Geolocation error:', error)
          alert('현재 위치를 가져올 수 없습니다.')
          setIsLocating(false)
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      )
    } else {
      alert('이 브라우저에서는 위치 서비스를 지원하지 않습니다.')
      setIsLocating(false)
    }
  }, [])

  // 로드뷰 활성화
  const activateRoadview = useCallback((position: any) => {
    if (!roadviewClientRef.current || !roadviewInstanceRef.current) return

    setRoadviewError(null)
    roadviewClientRef.current.getNearestPanoId(position, 50, (panoId: string) => {
      if (panoId) {
        roadviewInstanceRef.current.setPanoId(panoId, position)
        if (markerRef.current) {
          markerRef.current.setPosition(position)
        }
        setIsRoadviewActive(true)
      } else {
        setRoadviewError('이 위치에서는 로드뷰를 사용할 수 없습니다.')
        setTimeout(() => setRoadviewError(null), 3000)
      }
    })
  }, [])

  // 지도 타입 변경
  const updateMapType = useCallback((settings: MapSettings, forceRoadviewOverlay?: boolean) => {
    if (!mapInstanceRef.current) return
    const kakaoMap = mapInstanceRef.current

    if (settings.mapType === 'skyview') {
      kakaoMap.setMapTypeId(window.kakao.maps.MapTypeId.SKYVIEW)
    } else if (settings.mapType === 'hybrid') {
      kakaoMap.setMapTypeId(window.kakao.maps.MapTypeId.HYBRID)
    } else {
      kakaoMap.setMapTypeId(window.kakao.maps.MapTypeId.ROADMAP)
    }

    kakaoMap.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.TERRAIN)
    kakaoMap.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT)
    kakaoMap.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW)

    if (settings.showTerrain) {
      kakaoMap.addOverlayMapTypeId(window.kakao.maps.MapTypeId.TERRAIN)
    }
    if (settings.showCadastral) {
      kakaoMap.addOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT)
    }
    if (settings.showRoadview || forceRoadviewOverlay) {
      kakaoMap.addOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW)
    }
  }, [])

  // 설정 변경 핸들러
  const handleSettingsChange = useCallback((newSettings: Partial<MapSettings>) => {
    const updated = { ...localSettings, ...newSettings }
    setLocalSettings(updated)
    updateMapType(updated, viewModeRef.current === 'roadview')
    onMapSettingsChange?.(updated)
  }, [localSettings, updateMapType, onMapSettingsChange])

  // 로드뷰 닫기
  const closeRoadview = useCallback(() => {
    setIsRoadviewActive(false)
    setRoadviewError(null)
  }, [])

  // 선택 초기화
  const clearSelection = useCallback(() => {
    onMultiSelectChange?.([])
  }, [onMultiSelectChange])

  useEffect(() => {
    if (!apiKey) {
      setError('카카오맵 API 키가 설정되지 않았습니다.')
      setIsLoading(false)
      return
    }

    if (window.kakao?.maps) {
      initMap()
      return
    }

    const script = document.createElement('script')
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false&libraries=services,drawing`
    script.onerror = () => {
      setError('카카오맵 스크립트 로드 실패')
      setIsLoading(false)
    }
    script.onload = () => {
      window.kakao.maps.load(() => initMap())
    }
    document.head.appendChild(script)
  }, [])

  // viewMode ref 동기화
  useEffect(() => {
    viewModeRef.current = viewMode
  }, [viewMode])

  // multiSelectMode ref 동기화
  useEffect(() => {
    multiSelectModeRef.current = isMultiSelectMode
  }, [isMultiSelectMode])

  // measureMode ref 동기화
  useEffect(() => {
    measureModeRef.current = measureMode
  }, [measureMode])

  // 측정 모드 변경 시 초기화
  useEffect(() => {
    if (measureMode === 'none') {
      clearMeasurement()
    }
  }, [measureMode])

  // 거리 계산 함수
  const calculateDistance = useCallback((positions: any[]) => {
    if (positions.length < 2) return 0
    let distance = 0
    for (let i = 1; i < positions.length; i++) {
      const polyline = new window.kakao.maps.Polyline({
        path: [positions[i - 1], positions[i]],
      })
      distance += polyline.getLength()
    }
    return distance
  }, [])

  // 면적 계산 함수
  const calculateArea = useCallback((positions: any[]) => {
    if (positions.length < 3) return 0
    const polygon = new window.kakao.maps.Polygon({ path: positions })
    return polygon.getArea()
  }, [])

  // 측정 오버레이 생성
  const createMeasureOverlay = useCallback((position: any, content: string) => {
    if (!mapInstanceRef.current) return null
    const overlay = new window.kakao.maps.CustomOverlay({
      position,
      content: `<div class="measure-tooltip">${content}</div>`,
      yAnchor: 1.5,
      zIndex: 100,
    })
    overlay.setMap(mapInstanceRef.current)
    return overlay
  }, [])

  // 측정 초기화
  const clearMeasurement = useCallback(() => {
    // 그리기 객체 제거
    measureObjectsRef.current.forEach(obj => obj.setMap(null))
    measureObjectsRef.current = []

    // 오버레이 제거
    measureOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    measureOverlaysRef.current = []

    // 그리기 중인 객체 제거
    if (drawingLineRef.current) {
      drawingLineRef.current.setMap(null)
      drawingLineRef.current = null
    }
    if (drawingPolygonRef.current) {
      drawingPolygonRef.current.setMap(null)
      drawingPolygonRef.current = null
    }
    if (drawingCircleRef.current) {
      drawingCircleRef.current.setMap(null)
      drawingCircleRef.current = null
    }

    measurePointsRef.current = []
    radiusCenterRef.current = null
  }, [])

  // 포맷 함수
  const formatDistance = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)}km`
    return `${Math.round(meters)}m`
  }

  const formatArea = (sqMeters: number) => {
    if (sqMeters >= 10000) return `${(sqMeters / 10000).toFixed(2)}ha`
    if (sqMeters >= 1000000) return `${(sqMeters / 1000000).toFixed(2)}km²`
    return `${Math.round(sqMeters)}m²`
  }

  // 축척 표시 (레벨별)
  const getScaleText = (level: number) => {
    const scales: { [key: number]: string } = {
      1: '20m', 2: '30m', 3: '50m', 4: '100m', 5: '250m',
      6: '500m', 7: '1km', 8: '2km', 9: '4km', 10: '8km',
      11: '16km', 12: '32km', 13: '64km', 14: '128km',
    }
    return scales[level] || '50m'
  }

  // viewMode 변경 시 처리
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current) return

    if (viewMode === 'roadview') {
      mapInstanceRef.current.addOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW)
      if (markerRef.current) {
        markerRef.current.setVisible(true)
      }
    } else {
      setIsRoadviewActive(false)
      if (!localSettings.showRoadview) {
        mapInstanceRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW)
      }
      if (markerRef.current) {
        markerRef.current.setVisible(false)
      }
    }
  }, [viewMode, isMapReady, localSettings.showRoadview])

  // mapSettings prop 변경 시 동기화
  useEffect(() => {
    if (mapSettings && isMapReady) {
      setLocalSettings(mapSettings)
      updateMapType(mapSettings, viewMode === 'roadview')
    }
  }, [mapSettings, isMapReady, updateMapType, viewMode])

  // center prop 변경 시 지도 이동
  useEffect(() => {
    if (center && isMapReady && mapInstanceRef.current) {
      const newCenter = new window.kakao.maps.LatLng(center.lat, center.lng)
      mapInstanceRef.current.setCenter(newCenter)
      mapInstanceRef.current.setLevel(3) // 적당한 줌 레벨로 설정
    }
  }, [center, isMapReady])

  const initMap = () => {
    if (!mapRef.current || !roadviewRef.current) {
      console.error('KakaoMap: refs not ready')
      return
    }

    try {
      const options = {
        center: new window.kakao.maps.LatLng(33.499, 126.531),
        level: 3,
      }
      const kakaoMap = new window.kakao.maps.Map(mapRef.current, options)
      mapInstanceRef.current = kakaoMap
      setIsLoading(false)

      // 초기 지도 설정 적용
      updateMapType(localSettings)

      // 로드뷰 초기화
      const rv = new window.kakao.maps.Roadview(roadviewRef.current)
      const rvClient = new window.kakao.maps.RoadviewClient()
      roadviewInstanceRef.current = rv
      roadviewClientRef.current = rvClient

      // 로드뷰 위치 마커
      const marker = new window.kakao.maps.Marker({
        position: kakaoMap.getCenter(),
        map: kakaoMap,
        draggable: true,
        zIndex: 10,
        image: new window.kakao.maps.MarkerImage(
          'https://t1.daumcdn.net/localimg/localimages/07/2018/pc/roadview_minimap_wk_2018.png',
          new window.kakao.maps.Size(39, 69),
          { offset: new window.kakao.maps.Point(19, 69) }
        )
      })
      marker.setVisible(false)
      markerRef.current = marker

      // 마커 드래그 종료 시 로드뷰 이동
      window.kakao.maps.event.addListener(marker, 'dragend', () => {
        const pos = marker.getPosition()
        activateRoadview(pos)
      })

      // 로드뷰 위치 변경 시 마커 위치 동기화
      window.kakao.maps.event.addListener(rv, 'position_changed', () => {
        const pos = rv.getPosition()
        marker.setPosition(pos)
        kakaoMap.setCenter(pos)
      })

      // 지도 레벨 변경 이벤트
      window.kakao.maps.event.addListener(kakaoMap, 'zoom_changed', () => {
        setMapLevel(kakaoMap.getLevel())
      })

      // 지도 클릭 이벤트
      const geocoder = new window.kakao.maps.services.Geocoder()

      // 측정 헬퍼 함수들
      const addMeasurePoint = (position: any) => {
        measurePointsRef.current.push(position)

        // 점 마커 추가
        const dotOverlay = new window.kakao.maps.CustomOverlay({
          position,
          content: '<div style="width:10px;height:10px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
          yAnchor: 0.5,
          xAnchor: 0.5,
          zIndex: 50,
        })
        dotOverlay.setMap(kakaoMap)
        measureOverlaysRef.current.push(dotOverlay)
      }

      const updateDistanceLine = () => {
        if (measurePointsRef.current.length < 2) return

        if (drawingLineRef.current) {
          drawingLineRef.current.setMap(null)
        }

        const line = new window.kakao.maps.Polyline({
          path: measurePointsRef.current,
          strokeWeight: 3,
          strokeColor: '#3b82f6',
          strokeOpacity: 0.8,
          strokeStyle: 'solid',
        })
        line.setMap(kakaoMap)
        drawingLineRef.current = line

        // 거리 표시
        const totalDistance = line.getLength()
        const lastPoint = measurePointsRef.current[measurePointsRef.current.length - 1]

        // 기존 거리 오버레이 제거
        measureOverlaysRef.current = measureOverlaysRef.current.filter(o => {
          if (o._isDistanceLabel) {
            o.setMap(null)
            return false
          }
          return true
        })

        const distanceOverlay = new window.kakao.maps.CustomOverlay({
          position: lastPoint,
          content: `<div style="background:white;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:bold;color:#3b82f6;box-shadow:0 1px 4px rgba(0,0,0,0.2);border:1px solid #3b82f6;">${formatDistance(totalDistance)}</div>`,
          yAnchor: 2,
          zIndex: 100,
        })
        ;(distanceOverlay as any)._isDistanceLabel = true
        distanceOverlay.setMap(kakaoMap)
        measureOverlaysRef.current.push(distanceOverlay)
      }

      const updateAreaPolygon = () => {
        if (measurePointsRef.current.length < 3) return

        if (drawingPolygonRef.current) {
          drawingPolygonRef.current.setMap(null)
        }

        const polygon = new window.kakao.maps.Polygon({
          path: measurePointsRef.current,
          strokeWeight: 2,
          strokeColor: '#10b981',
          strokeOpacity: 0.8,
          fillColor: '#10b981',
          fillOpacity: 0.3,
        })
        polygon.setMap(kakaoMap)
        drawingPolygonRef.current = polygon

        // 면적 표시
        const area = polygon.getArea()

        // 중심점 계산
        let sumLat = 0, sumLng = 0
        measurePointsRef.current.forEach((p: any) => {
          sumLat += p.getLat()
          sumLng += p.getLng()
        })
        const centerPos = new window.kakao.maps.LatLng(
          sumLat / measurePointsRef.current.length,
          sumLng / measurePointsRef.current.length
        )

        // 기존 면적 오버레이 제거
        measureOverlaysRef.current = measureOverlaysRef.current.filter(o => {
          if (o._isAreaLabel) {
            o.setMap(null)
            return false
          }
          return true
        })

        const areaOverlay = new window.kakao.maps.CustomOverlay({
          position: centerPos,
          content: `<div style="background:white;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:bold;color:#10b981;box-shadow:0 1px 4px rgba(0,0,0,0.2);border:1px solid #10b981;">${formatArea(area)}</div>`,
          yAnchor: 0.5,
          xAnchor: 0.5,
          zIndex: 100,
        })
        ;(areaOverlay as any)._isAreaLabel = true
        areaOverlay.setMap(kakaoMap)
        measureOverlaysRef.current.push(areaOverlay)
      }

      const finishMeasurement = () => {
        // 그리기 객체를 measureObjectsRef로 이동
        if (drawingLineRef.current) {
          measureObjectsRef.current.push(drawingLineRef.current)
          drawingLineRef.current = null
        }
        if (drawingPolygonRef.current) {
          measureObjectsRef.current.push(drawingPolygonRef.current)
          drawingPolygonRef.current = null
        }
        measurePointsRef.current = []
      }

      window.kakao.maps.event.addListener(kakaoMap, 'click', (e: any) => {
        const lat = e.latLng.getLat()
        const lng = e.latLng.getLng()

        // 로드뷰 모드에서 클릭하면 해당 위치 로드뷰 활성화
        if (viewModeRef.current === 'roadview') {
          activateRoadview(e.latLng)
          return
        }

        // 측정 모드 처리
        if (measureModeRef.current !== 'none') {
          const position = e.latLng

          if (measureModeRef.current === 'distance') {
            addMeasurePoint(position)
            if (measurePointsRef.current.length >= 2) {
              updateDistanceLine()
            }
            return
          }

          if (measureModeRef.current === 'area') {
            addMeasurePoint(position)
            if (measurePointsRef.current.length >= 3) {
              updateAreaPolygon()
            }
            return
          }

          if (measureModeRef.current === 'radius') {
            if (!radiusCenterRef.current) {
              // 중심점 설정
              radiusCenterRef.current = position

              const centerOverlay = new window.kakao.maps.CustomOverlay({
                position,
                content: '<div style="width:12px;height:12px;background:#f59e0b;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
                yAnchor: 0.5,
                xAnchor: 0.5,
                zIndex: 50,
              })
              centerOverlay.setMap(kakaoMap)
              measureOverlaysRef.current.push(centerOverlay)
            } else {
              // 반경 완료
              const center = radiusCenterRef.current
              const radiusLine = new window.kakao.maps.Polyline({
                path: [center, position],
              })
              const radius = radiusLine.getLength()

              // 원 그리기
              const circle = new window.kakao.maps.Circle({
                center,
                radius,
                strokeWeight: 2,
                strokeColor: '#f59e0b',
                strokeOpacity: 0.8,
                fillColor: '#f59e0b',
                fillOpacity: 0.2,
              })
              circle.setMap(kakaoMap)
              measureObjectsRef.current.push(circle)

              // 반경 표시
              const radiusOverlay = new window.kakao.maps.CustomOverlay({
                position,
                content: `<div style="background:white;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:bold;color:#f59e0b;box-shadow:0 1px 4px rgba(0,0,0,0.2);border:1px solid #f59e0b;">반경 ${formatDistance(radius)}</div>`,
                yAnchor: 2,
                zIndex: 100,
              })
              radiusOverlay.setMap(kakaoMap)
              measureOverlaysRef.current.push(radiusOverlay)

              radiusCenterRef.current = null
            }
            return
          }
        }

        // 일반 모드에서는 필지 정보 조회
        geocoder.coord2Address(lng, lat, (result: any, status: any) => {
          if (status !== window.kakao.maps.services.Status.OK) return

          const addr = result[0].address
          const jibunAddress = addr?.address_name || ''
          const bCode = addr?.b_code || ''
          const mountainYn = addr?.mountain_yn === 'Y'
          const mainNo = (addr?.main_address_no || '').padStart(4, '0')
          const subNo = (addr?.sub_address_no || '0').padStart(4, '0')

          const pnu = bCode + (mountainYn ? '1' : '0') + mainNo + subNo

          onParcelClick?.({
            address_jibun: jibunAddress,
            pnu,
            latitude: lat,
            longitude: lng,
          }, multiSelectModeRef.current)
        })
      })

      // 더블클릭으로 측정 완료
      window.kakao.maps.event.addListener(kakaoMap, 'dblclick', () => {
        if (measureModeRef.current === 'distance' && measurePointsRef.current.length >= 2) {
          finishMeasurement()
        }
        if (measureModeRef.current === 'area' && measurePointsRef.current.length >= 3) {
          finishMeasurement()
        }
      })

      setIsMapReady(true)
    } catch (err) {
      console.error('KakaoMap: Error creating map:', err)
      setError('지도 생성 중 오류가 발생했습니다.')
      setIsLoading(false)
    }
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center p-4">
          <div className="text-red-500 text-4xl mb-2">⚠️</div>
          <p className="text-red-600 font-medium">{error}</p>
          <p className="text-sm text-gray-500 mt-2">브라우저 콘솔을 확인해주세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-30">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-gray-500 text-sm">지도 로딩 중...</p>
          </div>
        </div>
      )}

      {/* 다중 선택 모드 안내 */}
      {isMultiSelectMode && !isRoadviewActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-green-600 text-white rounded-lg shadow-lg px-4 py-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            다중 선택 모드 - 필지를 클릭하여 추가/제거
          </p>
        </div>
      )}

      {/* 선택된 필지 개수 표시 */}
      {selectedParcels.length > 1 && !isRoadviewActive && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-blue-600 text-white rounded-full shadow-lg px-4 py-2 flex items-center gap-3">
          <span className="text-sm font-medium">{selectedParcels.length}개 필지 선택됨</span>
          <button
            onClick={clearSelection}
            className="text-white/80 hover:text-white text-sm underline"
          >
            초기화
          </button>
        </div>
      )}

      {/* 지도 */}
      <div
        ref={mapRef}
        className={`absolute transition-all duration-300 ${
          isRoadviewActive
            ? 'bottom-4 left-4 w-80 h-52 z-20 rounded-lg shadow-xl border-2 border-white'
            : 'inset-0 z-10'
        }`}
      />

      {/* 로드뷰 */}
      <div
        ref={roadviewRef}
        className={`absolute inset-0 transition-opacity duration-300 ${
          isRoadviewActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
        }`}
      />

      {/* 로드뷰 에러 메시지 */}
      {roadviewError && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 bg-gray-900/90 text-white px-4 py-3 rounded-lg shadow-xl">
          <p className="text-sm">{roadviewError}</p>
        </div>
      )}

      {/* 로드뷰 모드 안내 */}
      {viewMode === 'roadview' && !isRoadviewActive && !isMultiSelectMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-blue-600 text-white rounded-lg shadow-lg px-4 py-2">
          <p className="text-sm font-medium">파란색 도로를 클릭하면 로드뷰가 표시됩니다</p>
        </div>
      )}

      {/* 로드뷰 닫기 버튼 */}
      {isRoadviewActive && (
        <button
          onClick={closeRoadview}
          className="absolute top-4 right-4 z-20 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
          title="로드뷰 닫기"
        >
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* 로드뷰 안내 */}
      {isRoadviewActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur rounded-lg shadow-lg px-4 py-2">
          <p className="text-sm text-gray-700">
            <span className="font-medium">로드뷰</span> - 마우스로 회전, 휠로 확대/축소
          </p>
        </div>
      )}

      {/* 우측 컨트롤 패널 */}
      {!isRoadviewActive && (
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
          <button
            onClick={() => setShowSettingsPanel(!showSettingsPanel)}
            className={`p-2.5 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-colors ${
              showSettingsPanel ? 'bg-blue-50 text-blue-600' : 'text-gray-600'
            }`}
            title="지도 설정"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>

          <button
            onClick={moveToCurrentLocation}
            disabled={isLocating}
            className="p-2.5 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-colors text-gray-600 disabled:opacity-50"
            title="현위치"
          >
            {isLocating ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
              </svg>
            )}
          </button>

          {/* 다중선택 토글 버튼 */}
          <button
            onClick={() => onMultiSelectModeChange?.(!isMultiSelectMode)}
            className={`p-2.5 rounded-lg shadow-lg transition-colors ${
              isMultiSelectMode
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title={isMultiSelectMode ? '다중선택 모드 끄기' : '다중선택 모드 켜기'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16M4 12h16m-7 7h7" />
              <rect x="3" y="3" width="4" height="4" rx="1" strokeWidth={2} />
              <rect x="3" y="10" width="4" height="4" rx="1" strokeWidth={2} />
              <rect x="3" y="17" width="4" height="4" rx="1" strokeWidth={2} />
            </svg>
          </button>

          <div className="flex flex-col bg-white rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={() => mapInstanceRef.current?.setLevel(mapInstanceRef.current.getLevel() - 1)}
              className="p-2.5 hover:bg-gray-50 transition-colors text-gray-600 border-b"
              title="확대"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
              </svg>
            </button>
            <button
              onClick={() => mapInstanceRef.current?.setLevel(mapInstanceRef.current.getLevel() + 1)}
              className="p-2.5 hover:bg-gray-50 transition-colors text-gray-600"
              title="축소"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 지도 설정 패널 */}
      {showSettingsPanel && !isRoadviewActive && (
        <div className="absolute top-48 right-4 z-20 bg-white rounded-lg shadow-xl p-4 w-64">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">지도 설정</h3>

          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">지도 유형</p>
            <div className="flex gap-1">
              <button
                onClick={() => handleSettingsChange({ mapType: 'map' })}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${
                  localSettings.mapType === 'map'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                일반
              </button>
              <button
                onClick={() => handleSettingsChange({ mapType: 'skyview' })}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${
                  localSettings.mapType === 'skyview'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                위성
              </button>
              <button
                onClick={() => handleSettingsChange({ mapType: 'hybrid' })}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${
                  localSettings.mapType === 'hybrid'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                하이브리드
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-2">오버레이</p>

            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                checked={localSettings.showCadastral}
                onChange={(e) => handleSettingsChange({ showCadastral: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">지적편집도</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                checked={localSettings.showTerrain}
                onChange={(e) => handleSettingsChange({ showTerrain: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">지형도</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                checked={localSettings.showRoadview}
                onChange={(e) => handleSettingsChange({ showRoadview: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">로드뷰 도로</span>
            </label>
          </div>

          <button
            onClick={() => setShowSettingsPanel(false)}
            className="w-full mt-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>
      )}

      {/* 측정 도구 패널 (우측) */}
      {!isRoadviewActive && (
        <div className="absolute top-1/2 -translate-y-1/2 right-4 z-20 flex flex-col gap-2" style={{ marginTop: '100px' }}>
          <div className="flex flex-col bg-white rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={() => setMeasureMode(measureMode === 'distance' ? 'none' : 'distance')}
              className={`p-2.5 transition-colors border-b ${
                measureMode === 'distance'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="거리 측정"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 8l4-4m-4 4l4 4M20 16H4m16 0l-4-4m4 4l-4 4" />
              </svg>
            </button>
            <button
              onClick={() => setMeasureMode(measureMode === 'area' ? 'none' : 'area')}
              className={`p-2.5 transition-colors border-b ${
                measureMode === 'area'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="면적 측정"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4V4z" />
                <circle cx="4" cy="4" r="1.5" fill="currentColor" />
                <circle cx="20" cy="4" r="1.5" fill="currentColor" />
                <circle cx="4" cy="20" r="1.5" fill="currentColor" />
                <circle cx="20" cy="20" r="1.5" fill="currentColor" />
              </svg>
            </button>
            <button
              onClick={() => setMeasureMode(measureMode === 'radius' ? 'none' : 'radius')}
              className={`p-2.5 transition-colors ${
                measureMode === 'radius'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="반경 측정"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12h5" />
              </svg>
            </button>
          </div>

          {/* 범례 토글 버튼 */}
          <button
            onClick={() => setShowLegend(!showLegend)}
            className={`p-2.5 rounded-lg shadow-lg transition-colors ${
              showLegend
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title="지적편집도 범례"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>
      )}

      {/* 측정 모드 안내 */}
      {measureMode !== 'none' && !isRoadviewActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-blue-600 text-white rounded-lg shadow-lg px-4 py-2">
          <p className="text-sm font-medium flex items-center gap-2">
            {measureMode === 'distance' && '지도를 클릭하여 거리를 측정하세요 (더블클릭으로 완료)'}
            {measureMode === 'area' && '지도를 클릭하여 면적을 측정하세요 (더블클릭으로 완료)'}
            {measureMode === 'radius' && '중심점을 클릭한 후 드래그하여 반경을 측정하세요'}
            <button
              onClick={() => setMeasureMode('none')}
              className="ml-2 text-white/80 hover:text-white"
            >
              ✕
            </button>
          </p>
        </div>
      )}

      {/* 지적편집도 범례 패널 */}
      {showLegend && localSettings.showCadastral && !isRoadviewActive && (
        <div className="absolute bottom-16 left-4 z-20 bg-white rounded-lg shadow-xl p-4 w-80">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-800 text-sm">지적편집도 범례</h3>
            <button
              onClick={() => setShowLegend(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 범례 내용 */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-gray-800"></div>
              <span className="text-gray-600">시도경계</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-gray-600"></div>
              <span className="text-gray-600">법정동리경계</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-gray-800">234</span>
              <span className="text-gray-600">대표본번</span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-gray-500"></div>
              <span className="text-gray-600">시군구경계</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-blue-500"></div>
              <span className="text-gray-600">행정동경계</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-blue-600">234</span>
              <span className="text-gray-600">독립본번</span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-gray-400 border-dashed border-t"></div>
              <span className="text-gray-600">읍면경계</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-pink-400"></div>
              <span className="text-gray-600">지적경계</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">234</span>
              <span className="text-gray-600">부번</span>
            </div>
          </div>

          {/* 용도지역 범례 */}
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-gray-500 mb-2">용도지역</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-yellow-200 border border-yellow-400"></div>
                <span className="text-gray-600">주거지역</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-blue-200 border border-blue-400"></div>
                <span className="text-gray-600">상업지역</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-purple-200 border border-purple-400"></div>
                <span className="text-gray-600">공업지역</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-green-200 border border-green-400"></div>
                <span className="text-gray-600">녹지지역</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-pink-200 border border-pink-400"></div>
                <span className="text-gray-600">관리지역</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-orange-200 border border-orange-400"></div>
                <span className="text-gray-600">농림지역</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 축척 바 */}
      {!isRoadviewActive && (
        <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur rounded px-2 py-1 flex items-center gap-2 text-xs text-gray-600">
          <div className="flex items-center">
            <div className="w-12 h-1 bg-gray-800 relative">
              <div className="absolute -left-px top-0 w-0.5 h-2 bg-gray-800"></div>
              <div className="absolute -right-px top-0 w-0.5 h-2 bg-gray-800"></div>
            </div>
          </div>
          <span className="font-medium">{getScaleText(mapLevel)}</span>
        </div>
      )}

    </div>
  )
}
