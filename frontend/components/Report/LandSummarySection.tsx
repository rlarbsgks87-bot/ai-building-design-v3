'use client'

import type { LandSummary } from '@/types/report'

interface JejuSpecific {
  reviewChecks?: {
    reviewType: string
    applicable: string
    schedule: string
    basis: string
  }[]
  infrastructure?: {
    facilityType: string
    available: string
    location?: string
    note: string
  }[]
  buildableUses?: {
    use: string
    available: string
    conditions?: string
  }[]
  contacts?: {
    agency: string
    department: string
    phone: string
  }[]
}

interface LandSummarySectionProps {
  landSummary: LandSummary
  jejuSpecific?: JejuSpecific
}

export function LandSummarySection({ landSummary, jejuSpecific }: LandSummarySectionProps) {
  const formatNumber = (num: number) => {
    return num.toLocaleString('ko-KR')
  }

  const formatArea = (area: number) => {
    const pyeong = area / 3.3058
    return `${formatNumber(Math.round(area * 10) / 10)}㎡ (${pyeong.toFixed(1)}평)`
  }

  const formatPrice = (price: number) => {
    if (price >= 100000000) {
      return `${(price / 100000000).toFixed(1)}억원`
    } else if (price >= 10000) {
      return `${formatNumber(Math.round(price / 10000))}만원`
    }
    return `${formatNumber(price)}원`
  }

  return (
    <div className="p-8 bg-white min-h-[297mm]">
      {/* 섹션 타이틀 */}
      <div className="border-l-4 border-blue-600 pl-4 mb-8">
        <h2 className="text-2xl font-bold text-gray-900">대지 현황</h2>
      </div>

      {/* 대지 정보 테이블 */}
      <div className="mb-10">
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold w-36 border border-gray-300">위치</td>
              <td className="py-4 px-4 border border-gray-300" colSpan={3}>{landSummary.address}</td>
            </tr>
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">용도지역</td>
              <td className="py-4 px-4 border border-gray-300">도시지역, {landSummary.useZone}</td>
              <td className="py-4 px-4 bg-gray-100 font-semibold w-36 border border-gray-300">용도지구</td>
              <td className="py-4 px-4 border border-gray-300">{landSummary.useDistrict || '-'}</td>
            </tr>
            {landSummary.useArea && landSummary.useArea.length > 0 && (
              <tr>
                <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">용도구역</td>
                <td className="py-4 px-4 border border-gray-300" colSpan={3}>
                  {landSummary.useArea.join(', ')}
                </td>
              </tr>
            )}
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">지목</td>
              <td className="py-4 px-4 border border-gray-300">{landSummary.landCategory}</td>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">토지면적</td>
              <td className="py-4 px-4 border border-gray-300 font-medium">{formatArea(landSummary.area)}</td>
            </tr>
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">최대건폐율</td>
              <td className="py-4 px-4 border border-gray-300 font-medium text-blue-600">{landSummary.maxCoverageRatio}%</td>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">최대용적률</td>
              <td className="py-4 px-4 border border-gray-300 font-medium text-blue-600">{landSummary.maxFarRatio}%</td>
            </tr>
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">도로접면</td>
              <td className="py-4 px-4 border border-gray-300">{landSummary.roadAccess}</td>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">지형</td>
              <td className="py-4 px-4 border border-gray-300">{landSummary.terrainShape} / {landSummary.terrainHeight}</td>
            </tr>
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">공시지가</td>
              <td className="py-4 px-4 border border-gray-300" colSpan={3}>
                {formatNumber(landSummary.landPrice)}원/㎡
                {landSummary.estimatedLandPrice && (
                  <span className="ml-4 text-gray-600">
                    (추정 토지가: <span className="font-medium text-red-600">{formatPrice(landSummary.estimatedLandPrice)}</span>)
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 제주 특화: 심의 검토 */}
      {jejuSpecific?.reviewChecks && (
        <div className="mb-10">
          <h3 className="text-lg font-bold text-blue-600 mb-4">심의 검토</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-3 px-4 text-left font-semibold border border-gray-300">심의 종류</th>
                <th className="py-3 px-4 text-center font-semibold border border-gray-300 w-28">해당 여부</th>
                <th className="py-3 px-4 text-left font-semibold border border-gray-300">심의 일정</th>
                <th className="py-3 px-4 text-left font-semibold border border-gray-300">관련 근거</th>
              </tr>
            </thead>
            <tbody>
              {jejuSpecific.reviewChecks.map((review, idx) => (
                <tr key={idx}>
                  <td className="py-3 px-4 border border-gray-300">{review.reviewType}</td>
                  <td className={`py-3 px-4 text-center border border-gray-300 font-medium ${
                    review.applicable === '대상가능' ? 'text-blue-600 bg-blue-50' :
                    review.applicable === '확인필요' ? 'text-orange-600 bg-orange-50' :
                    'text-gray-500'
                  }`}>
                    {review.applicable}
                  </td>
                  <td className="py-3 px-4 border border-gray-300">{review.schedule}</td>
                  <td className="py-3 px-4 border border-gray-300 text-gray-600 text-xs">{review.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 제주 특화: 기반시설 + 건축가능용도 (2열 레이아웃) */}
      <div className="grid grid-cols-2 gap-6 mb-10">
        {/* 기반시설 현황 */}
        {jejuSpecific?.infrastructure && (
          <div>
            <h3 className="text-lg font-bold text-blue-600 mb-4">기반시설 현황</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="py-3 px-4 text-left font-semibold border border-gray-300">시설</th>
                  <th className="py-3 px-4 text-center font-semibold border border-gray-300 w-24">상태</th>
                  <th className="py-3 px-4 text-left font-semibold border border-gray-300">비고</th>
                </tr>
              </thead>
              <tbody>
                {jejuSpecific.infrastructure.map((infra, idx) => (
                  <tr key={idx}>
                    <td className="py-3 px-4 border border-gray-300">{infra.facilityType}</td>
                    <td className={`py-3 px-4 text-center border border-gray-300 font-medium ${
                      infra.available === '확인필요' ? 'text-orange-600 bg-orange-50' : ''
                    }`}>
                      {infra.available}
                    </td>
                    <td className="py-3 px-4 border border-gray-300 text-gray-600">{infra.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 건축가능용도 */}
        {jejuSpecific?.buildableUses && (
          <div>
            <h3 className="text-lg font-bold text-blue-600 mb-4">건축가능 용도</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="py-3 px-4 text-left font-semibold border border-gray-300">용도</th>
                  <th className="py-3 px-4 text-center font-semibold border border-gray-300 w-24">가능여부</th>
                  <th className="py-3 px-4 text-left font-semibold border border-gray-300">조건</th>
                </tr>
              </thead>
              <tbody>
                {jejuSpecific.buildableUses.map((use, idx) => (
                  <tr key={idx}>
                    <td className="py-3 px-4 border border-gray-300">{use.use}</td>
                    <td className={`py-3 px-4 text-center border border-gray-300 font-medium ${
                      use.available === '가능' ? 'text-green-600 bg-green-50' :
                      use.available === '조건부가능' ? 'text-blue-600 bg-blue-50' :
                      'text-red-600 bg-red-50'
                    }`}>
                      {use.available}
                    </td>
                    <td className="py-3 px-4 border border-gray-300 text-gray-600">{use.conditions || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 제주 특화: 관할기관 연락처 */}
      {jejuSpecific?.contacts && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-blue-600 mb-4">관할기관 연락처</h3>
          <div className="grid grid-cols-3 gap-4">
            {jejuSpecific.contacts.map((contact, idx) => (
              <div key={idx} className="bg-gray-50 rounded-lg p-4">
                <div className="font-semibold text-gray-800">{contact.agency}</div>
                <div className="text-sm text-gray-600">{contact.department}</div>
                <div className="text-sm text-blue-600 mt-1">{contact.phone}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
