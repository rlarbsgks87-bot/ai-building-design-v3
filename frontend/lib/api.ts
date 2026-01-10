import axios, { AxiosError } from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 60초 (슬립 깨우기 대비)
  headers: {
    'Content-Type': 'application/json',
  },
})

// 토큰 인터셉터
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// 응답 에러 처리
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      }
    }
    return Promise.reject(error)
  }
)

// Types
export interface SearchResult {
  title: string
  address: string
  road_address: string
  x: number
  y: number
  pnu?: string
  sido?: string
  sigungu?: string
  dong?: string
  jibun?: string
}

export interface BuildingInfo {
  name: string | null
  main_purpose: string
  etc_purpose?: string | null
  total_area: number
  building_area: number
  plat_area?: number
  vl_rat_estm_area?: number
  bc_rat?: number
  vl_rat?: number
  height?: number
  structure?: string | null
  floors: {
    above: number
    below: number
  }
  parking?: {
    indoor_mechanical: number
    outdoor_mechanical: number
    indoor_auto: number
    outdoor_auto: number
    total: number
  }
  parking_count: number
  household_count?: number
  approval_date: string | null
}

export interface UseZone {
  name: string
  law?: string
}

export interface LandDetail {
  pnu: string
  address_jibun: string
  address_road: string
  parcel_area: number | null
  use_zone: string
  use_zones?: UseZone[]
  official_land_price: number | null
  latitude: number
  longitude: number
  building?: {
    exists: boolean
    buildings: BuildingInfo[]
  }
}

export interface Regulation {
  pnu: string
  address: string
  parcel_area: number
  use_zone: string
  coverage: number
  far: number
  height_limit: string | null
  north_setback: number
  note: string | null
  max_building_area: number
  max_floor_area: number
}

export interface MassResult {
  id: string
  pnu: string
  building_area: number
  total_floor_area: number
  coverage_ratio: number
  far_ratio: number
  floors: number
  height: number
  legal_check: {
    coverage_ok: boolean
    far_ok: boolean
    height_ok: boolean
    setback_ok: boolean
  }
  legal_limits: {
    coverage: number
    far: number
    height_limit: string | null
  }
  geometry_url: string
}

export interface MassGeometry {
  type: string
  format: string
  dimensions: {
    width: number
    height: number
    depth: number
  }
  position: {
    x: number
    y: number
    z: number
  }
  land: {
    latitude: number
    longitude: number
  }
}

// API Functions
export const healthApi = {
  check: async () => {
    const response = await api.get('/health/')
    return response.data
  },
}

export const authApi = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login/', { email, password })
    return response.data
  },
  register: async (data: { email: string; username: string; password: string; password_confirm: string }) => {
    const response = await api.post('/auth/register/', data)
    return response.data
  },
  refresh: async (refresh: string) => {
    const response = await api.post('/auth/refresh/', { refresh })
    return response.data
  },
  me: async () => {
    const response = await api.get('/auth/me/')
    return response.data
  },
}

export interface ParcelGeometry {
  geometry: [number, number][]  // [lng, lat][] 폴리곤 좌표
  bbox: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  dimensions: {
    width: number  // 미터 단위
    depth: number  // 미터 단위
  }
  center: {
    lng: number
    lat: number
  }
}

export interface AdjacentRoad {
  pnu: string
  geometry: [number, number][]  // [lng, lat][] 폴리곤 좌표
  jimok: string
  direction: 'north' | 'south' | 'east' | 'west' | 'unknown'
  center: {
    lng: number
    lat: number
  }
}

export interface AdjacentParcel {
  pnu: string
  geometry: [number, number][]  // [lng, lat][] 폴리곤 좌표
  jimok: string                 // 지목 (대, 전, 답 등)
  jibun: string                 // 지번 (예: "50-11대")
  direction: 'north' | 'south' | 'east' | 'west' | 'unknown'
  center: {
    lng: number
    lat: number
  }
  height?: number               // 건물 높이 (미터)
  floors?: number               // 층수
}

export interface KakaoRoad {
  direction: 'north' | 'south' | 'east' | 'west'
  road_name: string  // 도로명 (예: '연북로')
  road_address: string  // 전체 도로명 주소
  angle?: number  // 도로 각도 (도 단위, 동쪽=0°, 반시계 방향)
  found_directions?: string[]  // 발견된 방향들 (디버깅용)
}

export interface RoadWidth {
  min: number      // 최소 폭 (m)
  max: number      // 최대 폭 (m)
  average: number  // 평균 폭 (m)
  source: string   // 출처 (예: "소로2류(폭 8m~10m)")
}

export interface AdjacentRoadsResponse {
  success: boolean
  roads: AdjacentRoad[]
  adjacent_parcels?: AdjacentParcel[]  // 주변 필지 (도로 제외)
  kakao_roads?: KakaoRoad[]  // Kakao API에서 조회한 도로명 (VWorld 도로 없을 때 fallback)
  parcel_center: {
    lng: number
    lat: number
  }
  road_width?: RoadWidth  // 도로 폭 정보 (use_zones에서 추출)
}

export const landApi = {
  search: async (query: string): Promise<{ success: boolean; data: SearchResult[] }> => {
    const response = await api.get(`/land/search/?q=${encodeURIComponent(query)}`)
    return response.data
  },
  geocode: async (address: string) => {
    const response = await api.post('/land/geocode/', { address })
    return response.data
  },
  getDetail: async (pnu: string, x?: number, y?: number): Promise<{ success: boolean; data: LandDetail }> => {
    let url = `/land/${pnu}/`
    if (x && y) {
      url += `?x=${x}&y=${y}`
    }
    const response = await api.get(url)
    return response.data
  },
  getRegulation: async (pnu: string): Promise<{ success: boolean; data: Regulation }> => {
    const response = await api.get(`/land/${pnu}/regulation/`)
    return response.data
  },
  getGeometry: async (pnu: string): Promise<{ success: boolean } & ParcelGeometry> => {
    const response = await api.get(`/land/${pnu}/geometry/`)
    return response.data
  },
  getAdjacentRoads: async (pnu: string): Promise<AdjacentRoadsResponse> => {
    const response = await api.get(`/land/${pnu}/roads/`)
    return response.data
  },
  getByPoint: async (x: number, y: number) => {
    const response = await api.post('/land/by-point/', { x, y })
    return response.data
  },
}

export const massApi = {
  calculate: async (data: {
    pnu: string
    building_type: string
    target_floors: number
    setbacks?: {
      front: number
      back: number
      left: number
      right: number
    }
  }): Promise<{ success: boolean; data: MassResult }> => {
    const response = await api.post('/mass/calculate/', data)
    return response.data
  },
  getDetail: async (id: string) => {
    const response = await api.get(`/mass/${id}/`)
    return response.data
  },
  getGeometry: async (id: string): Promise<{ success: boolean; data: MassGeometry }> => {
    const response = await api.get(`/mass/${id}/geometry/`)
    return response.data
  },
}
