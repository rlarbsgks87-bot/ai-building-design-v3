'use client'

import React from 'react'
import type { AreaByUse, UnitType, FloorArea } from '@/types/report'

interface AreaOverviewSectionProps {
  areaOverview: {
    byUse: AreaByUse[]
    unitTypes: Record<string, UnitType[]>
    byFloor: FloorArea[]
  }
}

export function AreaOverviewSection({ areaOverview }: AreaOverviewSectionProps) {
  const formatNumber = (num: number) => {
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
  }

  const toPyeong = (sqm: number) => {
    return (sqm / 3.3058).toFixed(1)
  }

  // 합계 계산
  const totalByUse = areaOverview.byUse.reduce((acc, item) => ({
    exclusive: acc.exclusive + item.exclusive,
    common: acc.common + item.common,
    total: acc.total + item.total,
  }), { exclusive: 0, common: 0, total: 0 })

  return (
    <>
      {/* 페이지 1: 용도별 + 분양 면적표 */}
      <div className="p-8 bg-white min-h-[297mm]">
        {/* 섹션 타이틀 */}
        <div className="border-l-4 border-blue-600 pl-4 mb-8">
          <h2 className="text-2xl font-bold text-gray-900">면적 개요</h2>
        </div>

        {/* 용도별 면적표 - 간소화 */}
        <div className="mb-10">
          <h3 className="text-lg font-bold text-blue-600 mb-4">용도별 면적표</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-3 px-4 text-left border border-gray-300 font-semibold">용도</th>
                <th className="py-3 px-4 text-right border border-gray-300 font-semibold">전용면적</th>
                <th className="py-3 px-4 text-right border border-gray-300 font-semibold">공용면적</th>
                <th className="py-3 px-4 text-right border border-gray-300 font-semibold">연면적(㎡)</th>
                <th className="py-3 px-4 text-right border border-gray-300 font-semibold">연면적(평)</th>
                <th className="py-3 px-4 text-right border border-gray-300 font-semibold">비율</th>
              </tr>
            </thead>
            <tbody>
              {areaOverview.byUse.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-3 px-4 border border-gray-300">{item.use}</td>
                  <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(item.exclusive)}</td>
                  <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(item.common)}</td>
                  <td className="py-3 px-4 text-right border border-gray-300 font-medium">{formatNumber(item.total)}</td>
                  <td className="py-3 px-4 text-right border border-gray-300">{toPyeong(item.total)}</td>
                  <td className="py-3 px-4 text-right border border-gray-300">{item.useRatio.toFixed(0)}%</td>
                </tr>
              ))}
              <tr className="bg-gray-100 font-semibold">
                <td className="py-3 px-4 border border-gray-300">합계</td>
                <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(totalByUse.exclusive)}</td>
                <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(totalByUse.common)}</td>
                <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(totalByUse.total)}</td>
                <td className="py-3 px-4 text-right border border-gray-300">{toPyeong(totalByUse.total)}</td>
                <td className="py-3 px-4 text-right border border-gray-300">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 분양 면적표 (용도별 타입) - 간소화 */}
        {Object.entries(areaOverview.unitTypes).map(([use, types]) => {
          const totalUnits = types.reduce((sum, t) => sum + t.unitCount, 0)
          const totalExclusive = types.reduce((sum, t) => sum + t.exclusive * t.unitCount, 0)
          const totalSupply = types.reduce((sum, t) => sum + t.supply * t.unitCount, 0)
          const exclusiveRate = totalSupply > 0 ? (totalExclusive / totalSupply * 100) : 0

          return (
            <div key={use} className="mb-10">
              <h3 className="text-lg font-bold text-blue-600 mb-2">분양 면적표</h3>
              <p className="text-sm text-gray-600 mb-4">
                <span className="inline-block w-3 h-3 bg-yellow-400 rounded-full mr-2 align-middle"></span>
                {use} (전용률: {exclusiveRate.toFixed(1)}%)
              </p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-3 px-4 text-left border border-gray-300 font-semibold">타입</th>
                    <th className="py-3 px-4 text-center border border-gray-300 font-semibold">세대수</th>
                    <th className="py-3 px-4 text-right border border-gray-300 font-semibold">전용(㎡)</th>
                    <th className="py-3 px-4 text-right border border-gray-300 font-semibold">공급(㎡)</th>
                    <th className="py-3 px-4 text-right border border-gray-300 font-semibold">공급(평)</th>
                    <th className="py-3 px-4 text-right border border-gray-300 font-semibold">대지지분</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((type, idx) => (
                    <tr key={idx}>
                      <td className="py-3 px-4 border border-gray-300 font-medium">{type.typeName}</td>
                      <td className="py-3 px-4 text-center border border-gray-300">
                        {type.unitCount}세대 ({type.unitRatio.toFixed(0)}%)
                      </td>
                      <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(type.exclusive)}</td>
                      <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(type.supply)}</td>
                      <td className="py-3 px-4 text-right border border-gray-300">{toPyeong(type.supply)}</td>
                      <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(type.landShare)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-semibold">
                    <td className="py-3 px-4 border border-gray-300">합계</td>
                    <td className="py-3 px-4 text-center border border-gray-300">{totalUnits}세대</td>
                    <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(totalExclusive)}</td>
                    <td className="py-3 px-4 text-right border border-gray-300">{formatNumber(totalSupply)}</td>
                    <td className="py-3 px-4 text-right border border-gray-300">{toPyeong(totalSupply)}</td>
                    <td className="py-3 px-4 text-right border border-gray-300">
                      {formatNumber(types.reduce((sum, t) => sum + t.landShare, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })}

        {/* 층별 면적표 - 간소화 */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-blue-600 mb-4">층별 면적표</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-3 px-4 text-center border border-gray-300 font-semibold w-20">층</th>
                <th className="py-3 px-4 text-right border border-gray-300 font-semibold">전용면적</th>
                <th className="py-3 px-4 text-right border border-gray-300 font-semibold">공용면적</th>
                <th className="py-3 px-4 text-right border border-gray-300 font-semibold">바닥면적(㎡)</th>
                <th className="py-3 px-4 text-right border border-gray-300 font-semibold">바닥면적(평)</th>
                <th className="py-3 px-4 text-center border border-gray-300 font-semibold">세대수</th>
                <th className="py-3 px-4 text-center border border-gray-300 font-semibold">층고</th>
              </tr>
            </thead>
            <tbody>
              {areaOverview.byFloor.map((floor, idx) => {
                const floorExclusive = floor.areas.reduce((sum, a) => sum + a.exclusive, 0)
                const floorCommon = floor.areas.reduce((sum, a) => sum + a.commonWall + a.commonGeneral, 0)
                return (
                  <tr key={idx}>
                    <td className="py-3 px-4 text-center border border-gray-300 font-medium">
                      {typeof floor.floor === 'number' ? `${floor.floor}층` : floor.floor}
                    </td>
                    <td className="py-3 px-4 text-right border border-gray-300">
                      {floorExclusive > 0 ? formatNumber(floorExclusive) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right border border-gray-300">
                      {floorCommon > 0 ? formatNumber(floorCommon) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right border border-gray-300 font-medium">
                      {formatNumber(floor.totalArea)}
                    </td>
                    <td className="py-3 px-4 text-right border border-gray-300">{toPyeong(floor.totalArea)}</td>
                    <td className="py-3 px-4 text-center border border-gray-300">{floor.unitCount || 0}</td>
                    <td className="py-3 px-4 text-center border border-gray-300">{floor.floorHeight}m</td>
                  </tr>
                )
              })}
              <tr className="bg-gray-100 font-semibold">
                <td className="py-3 px-4 text-center border border-gray-300">합계</td>
                <td className="py-3 px-4 text-right border border-gray-300">
                  {formatNumber(areaOverview.byFloor.reduce((sum, f) =>
                    sum + f.areas.reduce((s, a) => s + a.exclusive, 0), 0))}
                </td>
                <td className="py-3 px-4 text-right border border-gray-300">
                  {formatNumber(areaOverview.byFloor.reduce((sum, f) =>
                    sum + f.areas.reduce((s, a) => s + a.commonWall + a.commonGeneral, 0), 0))}
                </td>
                <td className="py-3 px-4 text-right border border-gray-300">
                  {formatNumber(areaOverview.byFloor.reduce((sum, f) => sum + f.totalArea, 0))}
                </td>
                <td className="py-3 px-4 text-right border border-gray-300">
                  {toPyeong(areaOverview.byFloor.reduce((sum, f) => sum + f.totalArea, 0))}
                </td>
                <td className="py-3 px-4 text-center border border-gray-300">
                  {areaOverview.byFloor.reduce((sum, f) => sum + (f.unitCount || 0), 0)}
                </td>
                <td className="py-3 px-4 text-center border border-gray-300">
                  {areaOverview.byFloor.reduce((sum, f) => sum + f.floorHeight, 0).toFixed(1)}m
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 주의사항 */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-2">참고사항</p>
          <ul className="list-disc list-inside space-y-1">
            <li>단위세대 타입별 전용면적은 설계 조건에 따라 달라질 수 있습니다.</li>
            <li>전용면적 14㎡ 미만 세대는 산출에서 제외됩니다.</li>
          </ul>
        </div>
      </div>
    </>
  )
}
