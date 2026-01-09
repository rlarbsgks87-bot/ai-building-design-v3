'use client'

import { MassResult as MassResultType } from '@/lib/api'

interface MassResultProps {
  result: MassResultType
}

export function MassResultPanel({ result }: MassResultProps) {
  const { legal_check, legal_limits } = result

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-bold text-gray-900 mb-4">매스 계산 결과</h3>

      <div className="space-y-4">
        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-3">
          <ResultItem label="건축면적" value={`${result.building_area.toLocaleString()} m²`} />
          <ResultItem label="연면적" value={`${result.total_floor_area.toLocaleString()} m²`} />
          <ResultItem label="층수" value={`${result.floors}층`} />
          <ResultItem label="높이" value={`${result.height}m`} />
        </div>

        <hr />

        {/* 건폐율 */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">건폐율</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">{result.coverage_ratio}%</span>
              <span className="text-gray-400">/ {legal_limits.coverage}%</span>
              <StatusBadge ok={legal_check.coverage_ok} />
            </div>
          </div>
          <ProgressBar
            value={result.coverage_ratio}
            max={legal_limits.coverage}
            ok={legal_check.coverage_ok}
          />
        </div>

        {/* 용적률 */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">용적률</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">{result.far_ratio}%</span>
              <span className="text-gray-400">/ {legal_limits.far}%</span>
              <StatusBadge ok={legal_check.far_ok} />
            </div>
          </div>
          <ProgressBar
            value={result.far_ratio}
            max={legal_limits.far}
            ok={legal_check.far_ok}
          />
        </div>

        {/* 법규 체크 */}
        <div className="bg-gray-50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-gray-700 mb-2">법규 검토</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <CheckItem label="건폐율" ok={legal_check.coverage_ok} />
            <CheckItem label="용적률" ok={legal_check.far_ok} />
            <CheckItem label="높이제한" ok={legal_check.height_ok} />
            <CheckItem label="이격거리" ok={legal_check.setback_ok} />
          </div>
        </div>

        {/* 3D 뷰어 버튼 */}
        <a
          href={`/viewer?mass_id=${result.id}`}
          className="block w-full py-2 text-center bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
        >
          3D 뷰어에서 보기
        </a>
      </div>
    </div>
  )
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900">{value}</p>
    </div>
  )
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 text-xs rounded-full ${
        ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      }`}
    >
      {ok ? '적합' : '초과'}
    </span>
  )
}

function ProgressBar({
  value,
  max,
  ok,
}: {
  value: number
  max: number
  ok: boolean
}) {
  const percentage = Math.min((value / max) * 100, 100)

  return (
    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
      <div
        className={`h-full transition-all ${ok ? 'bg-green-500' : 'bg-red-500'}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className={ok ? 'text-green-600' : 'text-red-600'}>
        {ok ? '✓' : '✗'}
      </span>
      <span className="text-gray-700">{label}</span>
    </div>
  )
}
