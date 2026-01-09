'use client'

import type { FeasibilityAnalysis, LandPriceInfo, PriceStandards } from '@/types/report'

interface FeasibilitySectionProps {
  feasibility: FeasibilityAnalysis
  priceInfo: {
    landPrice: LandPriceInfo
    priceStandards: PriceStandards
  }
}

export function FeasibilitySection({ feasibility, priceInfo }: FeasibilitySectionProps) {
  const formatNumber = (num: number) => {
    return num.toLocaleString('ko-KR')
  }

  const formatBillions = (price: number) => {
    if (Math.abs(price) >= 10000) {
      return `${(price / 10000).toFixed(2)}억원`
    }
    return `${formatNumber(price)}만원`
  }

  const profitColor = feasibility.profit.salesProfit >= 0 ? 'text-green-600' : 'text-red-600'
  const profitBg = feasibility.profit.salesProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'

  return (
    <div className="p-8 bg-white min-h-[297mm]">
      {/* 섹션 타이틀 */}
      <div className="border-l-4 border-blue-600 pl-4 mb-8">
        <h2 className="text-2xl font-bold text-gray-900">사업성 검토</h2>
      </div>

      {/* 수익 요약 - 상단에 배치 */}
      <div className="mb-10 grid grid-cols-2 gap-6">
        <div className={`rounded-xl p-6 border-2 ${profitBg}`}>
          <div className="text-sm text-gray-600 mb-2">예상 분양수익</div>
          <div className={`text-3xl font-bold ${profitColor}`}>
            {formatBillions(feasibility.profit.salesProfit)}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            수입 {formatBillions(feasibility.income.totalSales)} - 지출 {formatBillions(feasibility.expenses.total)}
          </div>
        </div>
        <div className="rounded-xl p-6 border-2 bg-blue-50 border-blue-200">
          <div className="text-sm text-gray-600 mb-2">예상 임대수익률 (연)</div>
          <div className="text-3xl font-bold text-blue-600">
            {feasibility.profit.rentalYield.toFixed(2)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            연 임대료 {formatNumber(feasibility.income.totalAnnualRental)}만원
          </div>
        </div>
      </div>

      {/* 수입 상세 */}
      <div className="mb-10">
        <h3 className="text-lg font-bold text-blue-600 mb-4">수입 (단위: 만원)</h3>

        <div className="grid grid-cols-2 gap-6">
          {/* 분양 수입 */}
          <div>
            <h4 className="font-semibold text-gray-700 mb-3">분양 수입</h4>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="py-3 px-4 text-left border border-gray-300 font-semibold">구분</th>
                  <th className="py-3 px-4 text-center border border-gray-300 font-semibold">세대</th>
                  <th className="py-3 px-4 text-right border border-gray-300 font-semibold">면적(㎡)</th>
                  <th className="py-3 px-4 text-right border border-gray-300 font-semibold">금액</th>
                </tr>
              </thead>
              <tbody>
                {feasibility.income.sales.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3 px-4 border border-gray-300">
                      {item.typeName || item.use}
                    </td>
                    <td className="py-3 px-4 text-center border border-gray-300">{item.unitCount || '-'}</td>
                    <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(Math.round(item.area))}</td>
                    <td className="py-3 px-4 text-right border border-gray-300 font-medium">{formatNumber(item.totalPrice)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-semibold">
                  <td colSpan={3} className="py-3 px-4 border border-gray-300">합계</td>
                  <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(feasibility.income.totalSales)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 임대 수입 */}
          <div>
            <h4 className="font-semibold text-gray-700 mb-3">임대 수입</h4>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="py-3 px-4 text-left border border-gray-300 font-semibold">구분</th>
                  <th className="py-3 px-4 text-right border border-gray-300 font-semibold">면적(㎡)</th>
                  <th className="py-3 px-4 text-right border border-gray-300 font-semibold">월 임대료</th>
                  <th className="py-3 px-4 text-right border border-gray-300 font-semibold">연 임대료</th>
                </tr>
              </thead>
              <tbody>
                {feasibility.income.rental.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3 px-4 border border-gray-300">
                      {item.typeName || item.use}
                    </td>
                    <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(Math.round(item.area))}</td>
                    <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(item.monthlyRent)}</td>
                    <td className="py-3 px-4 text-right border border-gray-300 font-medium">{formatNumber(item.annualRent)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-semibold">
                  <td colSpan={2} className="py-3 px-4 border border-gray-300">합계</td>
                  <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(feasibility.income.totalMonthlyRental)}</td>
                  <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(feasibility.income.totalAnnualRental)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 지출 상세 */}
      <div className="mb-10">
        <h3 className="text-lg font-bold text-blue-600 mb-4">지출 (단위: 만원)</h3>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="py-3 px-4 text-left border border-gray-300 font-semibold">항목</th>
                  <th className="py-3 px-4 text-right border border-gray-300 font-semibold">면적/비율</th>
                  <th className="py-3 px-4 text-right border border-gray-300 font-semibold">금액</th>
                </tr>
              </thead>
              <tbody>
                {feasibility.expenses.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3 px-4 border border-gray-300">{item.category}</td>
                    <td className="py-3 px-4 text-right border border-gray-300 text-gray-600">
                      {item.area ? `${formatNumber(Math.round(item.area))}㎡` : item.ratio || '-'}
                    </td>
                    <td className="py-3 px-4 text-right border border-gray-300 font-medium">{formatNumber(item.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-semibold">
                  <td colSpan={2} className="py-3 px-4 border border-gray-300">합계</td>
                  <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(feasibility.expenses.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="font-semibold text-gray-700 mb-3">기타 고려 지출</h4>
            <ul className="text-sm text-gray-600 space-y-2">
              {feasibility.expenses.otherExpenses.map((expense, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>{expense}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 기초자료 */}
      <div className="border-t-2 border-gray-200 pt-8">
        <h3 className="text-lg font-bold text-blue-600 mb-6">사업성 검토 기초자료</h3>

        <div className="grid grid-cols-3 gap-6">
          {/* 토지가격 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold text-gray-700 mb-3">토지가격</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">공시지가</span>
                <span className="font-semibold">{priceInfo.landPrice.officialPrice}억원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">추정 토지가</span>
                <span className="font-semibold text-red-600">{priceInfo.landPrice.estimatedPrice}억원</span>
              </div>
              <div className="text-xs text-gray-500">
                (공시지가 대비 {priceInfo.landPrice.multiplier}배)
              </div>
            </div>
          </div>

          {/* 분양가 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold text-gray-700 mb-3">용도별 분양가 (1㎡당)</h4>
            <div className="space-y-2">
              {priceInfo.priceStandards.salesPrices.flatMap(cat =>
                cat.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.use}</span>
                    <span className="font-medium">{formatNumber(item.pricePerSqm)}만원</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 임대료 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold text-gray-700 mb-3">용도별 월 임대료 (1㎡당)</h4>
            <div className="space-y-2">
              {priceInfo.priceStandards.rentalPrices.flatMap(cat =>
                cat.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.use}</span>
                    <span className="font-medium">{item.monthlyRentPerSqm}만원</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 산출근거 자료 */}
      <div className="mt-8 border-t border-gray-200 pt-6">
        <h4 className="font-semibold text-gray-700 mb-4">산출근거 자료</h4>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div className="space-y-3">
            <div>
              <p className="font-medium text-gray-700">분양가</p>
              <ul className="text-gray-600 list-disc list-inside">
                <li>국토교통부 실거래가 공개시스템</li>
                <li>국토교통부 표준지공시지가 열람</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-700">공사비</p>
              <ul className="text-gray-600 list-disc list-inside">
                <li>한국부동산원 2025 건물신축단가표</li>
              </ul>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="font-medium text-gray-700">임대료</p>
              <ul className="text-gray-600 list-disc list-inside">
                <li>한국부동산원 부동산통계정보</li>
                <li>상업용부동산임대동향</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-700">설계비 및 감리비</p>
              <ul className="text-gray-600 list-disc list-inside">
                <li>국토교통부고시 건축사 업무범위와 대가기준</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 주의사항 */}
      <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
        <p className="font-medium mb-2">유의사항</p>
        <ul className="list-disc list-inside space-y-1">
          <li>본 수익분석은 공공데이터 기반 추정치로, 실제 값과 차이가 있을 수 있습니다.</li>
          <li>기타 고려 지출(취득세, 광고비, 금융비용 등)을 반드시 포함하여 검토하세요.</li>
        </ul>
      </div>
    </div>
  )
}
