'use client'

interface DisclaimerSectionProps {
  disclaimers: string[]
}

export function DisclaimerSection({ disclaimers }: DisclaimerSectionProps) {
  return (
    <div className="p-8 bg-white min-h-[297mm]">
      {/* 섹션 타이틀 */}
      <div className="border-l-4 border-blue-600 pl-4 mb-8">
        <h2 className="text-2xl font-bold text-gray-900">유의사항</h2>
      </div>

      {/* 유의사항 목록 */}
      <div className="space-y-4">
        {disclaimers.map((disclaimer, idx) => (
          <div key={idx} className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
              {idx + 1}
            </span>
            <p className="text-gray-700 leading-relaxed">{disclaimer}</p>
          </div>
        ))}
      </div>

      {/* 법적 고지 */}
      <div className="mt-12 p-6 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="font-bold text-gray-900 mb-4">법적 고지사항</h3>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            • 본 보고서는 참고용 자료이며, 실제 건축 허가 및 인허가 절차에서 변경될 수 있습니다.
          </p>
          <p>
            • 토지이용규제, 지구단위계획, 건축조례 등은 수시로 변경될 수 있으므로
            반드시 관할 행정기관에 최신 정보를 확인하시기 바랍니다.
          </p>
          <p>
            • 본 서비스에서 제공하는 면적, 수익성 분석 등은 추정치이며,
            실제 값과 차이가 있을 수 있습니다.
          </p>
          <p>
            • 지적도와 실제 측량 결과는 차이가 있을 수 있으므로,
            정확한 대지 경계는 측량을 통해 확인하시기 바랍니다.
          </p>
        </div>
      </div>

      {/* 문의 안내 */}
      <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-bold text-blue-900 mb-4">문의 안내</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>
            본 보고서에 대한 문의사항이 있으시면 아래 연락처로 문의해 주시기 바랍니다.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <span className="text-blue-600 font-medium">이메일</span>
              <p className="mt-1">rlarbsgks87@gmail.com</p>
            </div>
            <div>
              <span className="text-blue-600 font-medium">전화</span>
              <p className="mt-1">010-6621-3132</p>
            </div>
          </div>
        </div>
      </div>

      {/* 저작권 */}
      <div className="mt-12 text-center text-xs text-gray-400">
        <p>© 2024 AI 건축 기획설계 서비스. All rights reserved.</p>
        <p className="mt-1">본 보고서의 무단 복제 및 배포를 금지합니다.</p>
      </div>
    </div>
  )
}
