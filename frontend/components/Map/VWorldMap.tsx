'use client'

import { KakaoMap } from './KakaoMap'

interface VWorldMapProps {
  onParcelClick?: (parcel: any) => void
}

// 카카오맵을 기본 지도로 사용
export function VWorldMap({ onParcelClick }: VWorldMapProps) {
  return <KakaoMap onParcelClick={onParcelClick} />
}
