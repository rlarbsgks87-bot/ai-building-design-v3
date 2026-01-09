'use client'

import { MassGeometry } from '@/lib/api'

interface MassInfoProps {
  geometry: MassGeometry
}

export function MassInfo({ geometry }: MassInfoProps) {
  const { dimensions, land } = geometry
  const floors = Math.floor(dimensions.height / 3) // 층고 3m 기준

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-bold text-gray-900 mb-4">3D 매스 정보</h3>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <InfoItem label="가로" value={`${dimensions.width.toFixed(1)} m`} />
          <InfoItem label="세로" value={`${dimensions.depth.toFixed(1)} m`} />
          <InfoItem label="높이" value={`${dimensions.height.toFixed(1)} m`} />
          <InfoItem label="층수" value={`${floors}층`} />
        </div>

        <hr />

        <div>
          <p className="text-sm text-gray-500 mb-1">좌표</p>
          <p className="font-mono text-sm">
            {land?.latitude?.toFixed(6)}, {land?.longitude?.toFixed(6)}
          </p>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
        <p className="font-medium mb-1">조작 방법</p>
        <ul className="space-y-1 text-blue-700">
          <li>- 마우스 드래그: 회전</li>
          <li>- 마우스 휠: 확대/축소</li>
          <li>- 우클릭 드래그: 이동</li>
        </ul>
      </div>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900">{value}</p>
    </div>
  )
}
