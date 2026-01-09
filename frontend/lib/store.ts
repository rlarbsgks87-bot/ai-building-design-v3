import { create } from 'zustand'
import { LandDetail, Regulation, MassResult, MassGeometry } from './api'

interface AppState {
  // Land
  selectedLand: LandDetail | null
  setSelectedLand: (land: LandDetail | null) => void

  // Regulation
  regulation: Regulation | null
  setRegulation: (regulation: Regulation | null) => void

  // Mass
  massResult: MassResult | null
  setMassResult: (result: MassResult | null) => void

  geometry: MassGeometry | null
  setGeometry: (geometry: MassGeometry | null) => void

  // UI State
  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  error: string | null
  setError: (error: string | null) => void

  // Map
  mapCenter: { lat: number; lng: number }
  setMapCenter: (center: { lat: number; lng: number }) => void

  mapZoom: number
  setMapZoom: (zoom: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  // Land
  selectedLand: null,
  setSelectedLand: (land) => set({ selectedLand: land }),

  // Regulation
  regulation: null,
  setRegulation: (regulation) => set({ regulation }),

  // Mass
  massResult: null,
  setMassResult: (result) => set({ massResult: result }),

  geometry: null,
  setGeometry: (geometry) => set({ geometry }),

  // UI State
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  error: null,
  setError: (error) => set({ error }),

  // Map (제주시 중심)
  mapCenter: { lat: 33.4996, lng: 126.5312 },
  setMapCenter: (center) => set({ mapCenter: center }),

  mapZoom: 17,
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
}))
