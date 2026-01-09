'use client'

import { useEffect, useRef, useState } from 'react'
import { landApi } from '@/lib/api'

interface SimpleMapProps {
  center: { lat: number; lng: number }
  zoom: number
  onParcelClick?: (parcel: any) => void
}

export function SimpleMap({ center, zoom, onParcelClick }: SimpleMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isLoading, setIsLoading] = useState(false)

  // VWorld WMS 타일 URL 생성
  const getWMSTileUrl = (x: number, y: number, z: number) => {
    const tileSize = 256
    const n = Math.pow(2, z)

    const minX = (x / n) * 360 - 180
    const maxX = ((x + 1) / n) * 360 - 180
    const minY = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * (180 / Math.PI)
    const maxY = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * (180 / Math.PI)

    const apiKey = process.env.NEXT_PUBLIC_VWORLD_API_KEY
    return (
      `https://api.vworld.kr/req/wms?` +
      `SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&` +
      `LAYERS=lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun&` +
      `STYLES=lp_pa_cbnd_bubun_line,lp_pa_cbnd_bonbun_line&` +
      `CRS=EPSG:4326&` +
      `BBOX=${minY},${minX},${maxY},${maxX}&` +
      `WIDTH=${tileSize}&HEIGHT=${tileSize}&` +
      `FORMAT=image/png&` +
      `key=${apiKey}`
    )
  }

  // 간단한 좌표 → 타일 변환
  const latLngToTile = (lat: number, lng: number, z: number) => {
    const n = Math.pow(2, z)
    const x = Math.floor(((lng + 180) / 360) * n)
    const latRad = (lat * Math.PI) / 180
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    )
    return { x, y }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 배경색
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 중심 표시
    ctx.fillStyle = '#3b82f6'
    ctx.beginPath()
    ctx.arc(canvas.width / 2, canvas.height / 2, 8, 0, Math.PI * 2)
    ctx.fill()

    // 좌표 표시
    ctx.fillStyle = '#374151'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(
      `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`,
      canvas.width / 2,
      canvas.height / 2 + 25
    )
    ctx.fillText('클릭하여 필지 선택', canvas.width / 2, canvas.height - 20)
  }, [center])

  const handleClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onParcelClick) return

    setIsLoading(true)
    try {
      const result = await landApi.getByPoint(center.lng, center.lat)
      if (result.success) {
        onParcelClick(result.data)
      }
    } catch (error) {
      console.error('Failed to get parcel:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative w-full h-full bg-gray-200">
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        className="w-full h-full cursor-pointer"
        onClick={handleClick}
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg px-4 py-2">
            <span className="text-gray-700">필지 정보 조회 중...</span>
          </div>
        </div>
      )}
      <div className="absolute top-2 left-2 bg-white rounded px-2 py-1 text-xs text-gray-600">
        VWorld API 키 필요
      </div>
    </div>
  )
}
