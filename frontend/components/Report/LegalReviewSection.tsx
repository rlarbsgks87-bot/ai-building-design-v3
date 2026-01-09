'use client'

import type { LegalReview } from '@/types/report'

interface LegalReviewSectionProps {
  legalReview: LegalReview
}

export function LegalReviewSection({ legalReview }: LegalReviewSectionProps) {
  const getStatusBadge = (status: 'compliant' | 'non-compliant' | 'not-applicable') => {
    switch (status) {
      case 'compliant':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">✓ 적합</span>
      case 'non-compliant':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">✗ 부적합</span>
      case 'not-applicable':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">해당없음</span>
    }
  }

  return (
    <div className="p-8 bg-white min-h-[297mm]">
      {/* 섹션 타이틀 */}
      <div className="border-l-4 border-blue-600 pl-4 mb-8">
        <h2 className="text-2xl font-bold text-gray-900">[첨부1] 세부 법규 검토 내용</h2>
      </div>

      {/* 지역/지구 태그 */}
      <div className="flex flex-wrap gap-2 mb-6">
        {legalReview.regions.map((region, idx) => (
          <span
            key={idx}
            className={`px-3 py-1 rounded-full text-sm ${
              idx === legalReview.regions.length - 1
                ? 'bg-red-100 text-red-700 border border-red-300'
                : 'bg-gray-100 text-gray-700 border border-gray-300'
            }`}
          >
            {region}
          </span>
        ))}
      </div>

      {/* 법규 검토 테이블 */}
      <div className="grid grid-cols-3 gap-6">
        {legalReview.items.map((item, idx) => (
          <div key={idx} className="border rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                {getStatusBadge(item.status)}
                {item.category}
              </h4>
            </div>
            <p className="text-xs text-gray-600 mb-2 leading-relaxed">
              {item.description}
            </p>
            <div className="text-right">
              <span className="text-sm font-medium text-blue-600">{item.requirement}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 법규 근거자료 */}
      <div className="mt-12">
        <div className="border-l-4 border-blue-600 pl-4 mb-6">
          <h2 className="text-xl font-bold text-gray-900">[첨부2] 건축법규 검토 근거자료</h2>
        </div>

        <div className="grid grid-cols-3 gap-6 text-xs">
          {/* 도로 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">도로</h4>
            <ul className="text-gray-600 space-y-1">
              <li>• 건축법 제2조(정의)</li>
              <li>• 건축법 제40조(대지의 안전 등)</li>
              <li>• 건축법 제44조(대지와 도로의 관계)</li>
              <li>• 건축법 제45조(도로의 지정,폐지 또는 변경)</li>
              <li>• 건축법 시행령 제28조(대지와 도로의 관계)</li>
            </ul>
          </div>

          {/* 건축행위제한 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">건축행위제한</h4>
            <ul className="text-gray-600 space-y-1">
              <li>• 국토의계획및이용에관한법률 제76조(용도지역 및 용도지구에서의 건축물의 건축 제한 등)</li>
              <li>• 국토의계획및이용에관한법률 시행령 제71조(용도지역안에서의 건축제한)</li>
              <li>• 국토의계획및이용에관한법률 시행령 별표 2~24</li>
            </ul>
          </div>

          {/* 건폐율 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">건폐율</h4>
            <ul className="text-gray-600 space-y-1">
              <li>• 국토의계획및이용에관한법률 제77조(용도지역의 건폐율)</li>
              <li>• 국토의계획및이용에관한법률 시행령 제84조(용도지역안에서의 건폐율)</li>
              <li>• 건축법 제55조(건축물의 건폐율)</li>
            </ul>
          </div>

          {/* 용적률 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">용적률</h4>
            <ul className="text-gray-600 space-y-1">
              <li>• 국토의계획및이용에관한법률 제78조(용도지역에서의 용적률)</li>
              <li>• 국토의계획및이용에관한법률 시행령 제85조(용도지역 안에서의 용적률)</li>
              <li>• 건축법 제56조(건축물의 용적률)</li>
            </ul>
          </div>

          {/* 일조권 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">일조 등의 확보를 위한 건축물의 높이제한</h4>
            <ul className="text-gray-600 space-y-1">
              <li>• 건축법 제61조(일조 등의 확보를 위한 건축물의 높이 제한)</li>
              <li>• 건축법 시행령 제86조(일조 등의 확보를 위한 건축물의 높이 제한)</li>
            </ul>
          </div>

          {/* 대지안의 공지 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">대지안의 공지</h4>
            <ul className="text-gray-600 space-y-1">
              <li>• 건축법 제58조(대지 안의 공지)</li>
              <li>• 건축법 시행령 제80조의2(대지 안의 공지)</li>
              <li>• 민법 제242조(경계선부근의 건축)</li>
            </ul>
          </div>

          {/* 주차장 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">주차장</h4>
            <ul className="text-gray-600 space-y-1">
              <li>• 주차장법 제19조(부설주차장의 설치)</li>
              <li>• 주차장법 시행령 제6조(부설주차장의 설치기준)</li>
              <li>• 주차장법 시행령 별표1 (부설주차장의 설치대상 시설물 종류 및 설치기준)</li>
            </ul>
          </div>

          {/* 조경 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">조경</h4>
            <ul className="text-gray-600 space-y-1">
              <li>• 건축법 제42조(대지의 조경)</li>
              <li>• 건축법 시행령 제27조(대지의 조경)</li>
              <li>• 국토교통부고시 조경기준</li>
            </ul>
          </div>

          {/* 면적 산정 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">면적, 높이, 층수 산정기준</h4>
            <ul className="text-gray-600 space-y-1">
              <li>• 건축법 제84조(면적,높이 및 층수의 산정)</li>
              <li>• 건축법 시행령 제119조(면적 등의 산정방법)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
