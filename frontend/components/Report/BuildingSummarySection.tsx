'use client'

import type { BuildingSummary } from '@/types/report'

interface BuildingSummarySectionProps {
  buildingSummary: BuildingSummary
}

export function BuildingSummarySection({ buildingSummary }: BuildingSummarySectionProps) {
  const formatNumber = (num: number) => {
    return num.toLocaleString('ko-KR')
  }

  const formatArea = (area: number) => {
    const pyeong = area / 3.3058
    return `${formatNumber(Math.round(area * 10) / 10)}㎡ (${pyeong.toFixed(1)}평)`
  }

  const maxCoverage = buildingSummary.planStandards[0]?.maxCoverageRatio || 60
  const maxFar = buildingSummary.planStandards[0]?.maxFarRatio || 200
  const isCoverageOver = buildingSummary.coverageRatio > maxCoverage
  const isFarOver = buildingSummary.farRatio > maxFar

  return (
    <div className="p-8 bg-white min-h-[297mm]">
      {/* 섹션 타이틀 */}
      <div className="border-l-4 border-blue-600 pl-4 mb-8">
        <h2 className="text-2xl font-bold text-gray-900">계획 건축개요</h2>
      </div>

      {/* 건폐율/용적률 요약 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className={`rounded-xl p-4 border-2 ${isCoverageOver ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-200'}`}>
          <div className="text-sm text-gray-600">건폐율</div>
          <div className={`text-2xl font-bold ${isCoverageOver ? 'text-red-600' : 'text-blue-600'}`}>
            {buildingSummary.coverageRatio}%
          </div>
          <div className={`text-xs ${isCoverageOver ? 'text-red-500' : 'text-gray-500'}`}>
            {isCoverageOver ? `법정 ${maxCoverage}% 초과` : `법정 ${maxCoverage}% 이하`}
          </div>
        </div>
        <div className={`rounded-xl p-4 border-2 ${isFarOver ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-200'}`}>
          <div className="text-sm text-gray-600">용적률</div>
          <div className={`text-2xl font-bold ${isFarOver ? 'text-red-600' : 'text-blue-600'}`}>
            {buildingSummary.farRatio}%
          </div>
          <div className={`text-xs ${isFarOver ? 'text-red-500' : 'text-gray-500'}`}>
            {isFarOver ? `법정 ${maxFar}% 초과` : `법정 ${maxFar}% 이하`}
          </div>
        </div>
        <div className="rounded-xl p-4 border-2 bg-gray-50 border-gray-200">
          <div className="text-sm text-gray-600">규모</div>
          <div className="text-2xl font-bold text-gray-800">{buildingSummary.scale.floors}</div>
          <div className="text-xs text-gray-500">높이 {buildingSummary.scale.height}m</div>
        </div>
        <div className="rounded-xl p-4 border-2 bg-gray-50 border-gray-200">
          <div className="text-sm text-gray-600">주차</div>
          <div className="text-2xl font-bold text-gray-800">
            {buildingSummary.parking.reduce((sum, p) => sum + p.count, 0)}대
          </div>
          <div className="text-xs text-gray-500">{buildingSummary.parking[0]?.type || '지상'}</div>
        </div>
      </div>

      {/* 건축개요 테이블 */}
      <div className="mb-8">
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold w-36 border border-gray-300">프로젝트명</td>
              <td className="py-4 px-4 border border-gray-300" colSpan={3}>{buildingSummary.projectName}</td>
            </tr>
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">대지위치</td>
              <td className="py-4 px-4 border border-gray-300" colSpan={3}>{buildingSummary.address}</td>
            </tr>
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">지역지구</td>
              <td className="py-4 px-4 border border-gray-300 text-sm" colSpan={3}>{buildingSummary.zoning}</td>
            </tr>
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">대지면적</td>
              <td className="py-4 px-4 border border-gray-300">{formatArea(buildingSummary.landArea)}</td>
              <td className="py-4 px-4 bg-gray-100 font-semibold w-36 border border-gray-300">용도</td>
              <td className="py-4 px-4 border border-gray-300">{buildingSummary.use}</td>
            </tr>
            <tr>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">건축면적</td>
              <td className="py-4 px-4 border border-gray-300 font-medium">{formatArea(buildingSummary.buildingArea)}</td>
              <td className="py-4 px-4 bg-gray-100 font-semibold border border-gray-300">연면적</td>
              <td className="py-4 px-4 border border-gray-300 font-medium">{formatArea(buildingSummary.totalFloorArea.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 연면적 상세 + 계획기준 (2열 레이아웃) */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* 연면적 상세 */}
        <div>
          <h3 className="text-lg font-bold text-blue-600 mb-4">연면적 상세</h3>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className="py-3 px-4 bg-gray-100 font-semibold border border-gray-300 w-32">지하층</td>
                <td className="py-3 px-4 border border-gray-300">{formatArea(buildingSummary.totalFloorArea.underground)}</td>
              </tr>
              <tr>
                <td className="py-3 px-4 bg-gray-100 font-semibold border border-gray-300">지상층</td>
                <td className="py-3 px-4 border border-gray-300">{formatArea(buildingSummary.totalFloorArea.aboveGround)}</td>
              </tr>
              <tr>
                <td className="py-3 px-4 bg-gray-100 font-semibold border border-gray-300">합계</td>
                <td className="py-3 px-4 border border-gray-300 font-medium">{formatArea(buildingSummary.totalFloorArea.total)}</td>
              </tr>
              <tr>
                <td className="py-3 px-4 bg-gray-100 font-semibold border border-gray-300">용적률 산정용</td>
                <td className="py-3 px-4 border border-gray-300">{formatArea(buildingSummary.totalFloorArea.forFarCalc)}</td>
              </tr>
              {buildingSummary.landscapeArea && (
                <tr>
                  <td className="py-3 px-4 bg-gray-100 font-semibold border border-gray-300">조경면적</td>
                  <td className="py-3 px-4 border border-gray-300">
                    {buildingSummary.landscapeArea}㎡ ({buildingSummary.landscapeRatio}%)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 계획기준 */}
        <div>
          <h3 className="text-lg font-bold text-blue-600 mb-4">계획기준</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-3 px-4 text-left font-semibold border border-gray-300">용도</th>
                <th className="py-3 px-4 text-center font-semibold border border-gray-300">층수</th>
                <th className="py-3 px-4 text-center font-semibold border border-gray-300">층고</th>
              </tr>
            </thead>
            <tbody>
              {buildingSummary.planStandards.map((standard, idx) => (
                <tr key={idx}>
                  <td className="py-3 px-4 border border-gray-300">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        standard.use.includes('다세대') ? 'bg-yellow-400' :
                        standard.use.includes('오피스텔') ? 'bg-orange-400' :
                        standard.use.includes('사무소') ? 'bg-blue-400' :
                        standard.use.includes('근린') ? 'bg-red-400' :
                        'bg-gray-400'
                      }`}></div>
                      {standard.use}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center border border-gray-300">{standard.floors}층</td>
                  <td className="py-3 px-4 text-center border border-gray-300">{standard.floorHeight}m</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-600">최대 용적률</div>
              <div className="font-semibold">{maxFar}%</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-600">최대 건폐율</div>
              <div className="font-semibold">{maxCoverage}%</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-600">최고 높이</div>
              <div className="font-semibold">{buildingSummary.planStandards[0]?.maxHeight || 30}m</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-600">최대 층수</div>
              <div className="font-semibold">{buildingSummary.planStandards[0]?.maxFloors || 7}층</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3D 건물 뷰 + 주의사항 */}
      <div className="grid grid-cols-3 gap-6">
        {/* 3D 뷰어 플레이스홀더 */}
        <div className="bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl h-40 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-10 h-10 text-blue-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-blue-500 text-sm font-medium">3D 건물 뷰</p>
            <p className="text-blue-400 text-xs mt-1">웹 서비스에서 확인</p>
          </div>
        </div>

        {/* 주의사항 */}
        <div className="col-span-2 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-2">참고사항</p>
          <ul className="list-disc list-inside space-y-1">
            <li>본 기획설계안의 세부 법규는 [법규 검토] 섹션을 참고하세요.</li>
            <li>지구단위계획 및 가로구역별 최고높이 지침 검토가 필요합니다.</li>
            <li>지적도와 실제 측량값 간 차이가 있을 수 있습니다.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
