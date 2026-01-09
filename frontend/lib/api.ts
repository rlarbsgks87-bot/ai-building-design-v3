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
}

export interface LandDetail {
  pnu: string
  address_jibun: string
  address_road: string
  parcel_area: number | null
  use_zone: string
  official_land_price: number | null
  latitude: number
  longitude: number
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
