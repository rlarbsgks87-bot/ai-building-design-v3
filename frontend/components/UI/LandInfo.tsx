'use client'

import { LandDetail, Regulation } from '@/lib/api'

interface LandInfoProps {
  land: LandDetail
  regulation: Regulation | null
}

export function LandInfo({ land, regulation }: LandInfoProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-bold text-gray-900 mb-4">토지 정보</h3>

      <div className="space-y-3">
        <InfoRow label="PNU" value={land.pnu} />
        <InfoRow label="지번주소" value={land.address_jibun} />
        {land.address_road && (
          <InfoRow label="도로명주소" value={land.address_road} />
        )}
        <InfoRow label="용도지역" value={land.use_zone || '-'} />
        {land.parcel_area && (
          <InfoRow label="대지면적" value={`${land.parcel_area.toLocaleString()} m²`} />
        )}
        {land.official_land_price && (
          <InfoRow
            label="공시지가"
            value={`${land.official_land_price.toLocaleString()} 원/m²`}
          />
        )}
      </div>

      {regulation && (
        <>
          <hr className="my-4" />
          <h4 className="text-md font-semibold text-gray-900 mb-3">법규 검토</h4>
          <div className="space-y-3">
            <InfoRow label="건폐율" value={`${regulation.coverage}%`} />
            <InfoRow label="용적률" value={`${regulation.far}%`} />
            {regulation.height_limit && (
              <InfoRow label="높이제한" value={regulation.height_limit} />
            )}
            <InfoRow label="정북이격" value={`${regulation.north_setback}m`} />
            <InfoRow
              label="최대건축면적"
              value={`${regulation.max_building_area.toLocaleString()} m²`}
            />
            <InfoRow
              label="최대연면적"
              value={`${regulation.max_floor_area.toLocaleString()} m²`}
            />
            {regulation.note && (
              <p className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                {regulation.note}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  )
}
