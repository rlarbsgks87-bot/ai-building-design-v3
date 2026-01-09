'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { landApi } from '@/lib/api'

interface OpenStreetMapProps {
  onParcelClick?: (parcel: any) => void
}

export function OpenStreetMap({ onParcelClick }: OpenStreetMapProps) {
  const [MapComponent, setMapComponent] = useState<any>(null)
  const { mapCenter, mapZoom, setMapCenter } = useAppStore()
  const [marker, setMarker] = useState<[number, number] | null>(null)

  useEffect(() => {
    // Dynamic import for SSR compatibility
    import('react-leaflet').then((mod) => {
      import('leaflet').then((L) => {
        // Fix default marker icon
        delete (L.Icon.Default.prototype as any)._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        })
      })
      setMapComponent(mod)
    })
  }, [])

  const handleMapClick = async (e: any) => {
    const { lat, lng } = e.latlng
    setMarker([lat, lng])

    try {
      const result = await landApi.getByPoint(lng, lat)
      if (result.success && onParcelClick) {
        onParcelClick(result.data)
      }
    } catch (error) {
      console.error('Failed to get parcel info:', error)
    }
  }

  if (!MapComponent) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-600">지도 로딩 중...</p>
        </div>
      </div>
    )
  }

  const { MapContainer, TileLayer, Marker, Popup, useMapEvents } = MapComponent

  function MapClickHandler() {
    useMapEvents({
      click: handleMapClick,
    })
    return null
  }

  return (
    <div className="w-full h-full">
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css"
      />
      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={mapZoom}
        className="w-full h-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler />
        {marker && (
          <Marker position={marker}>
            <Popup>
              선택한 위치<br />
              위도: {marker[0].toFixed(6)}<br />
              경도: {marker[1].toFixed(6)}
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}
