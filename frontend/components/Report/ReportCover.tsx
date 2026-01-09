'use client'

import type { DesignReport } from '@/types/report'

interface ReportCoverProps {
  report: DesignReport
}

export function ReportCover({ report }: ReportCoverProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`
  }

  return (
    <div className="min-h-[297mm] flex flex-col items-center justify-center p-16 bg-white">
      {/* 상단 장식선 */}
      <div className="w-full h-1 bg-blue-600 mb-16"></div>

      {/* 프로젝트명 */}
      <h1 className="text-4xl font-bold text-gray-900 mb-8 text-center">
        {report.projectName}
      </h1>

      {/* 부제 */}
      <h2 className="text-xl text-gray-600 mb-16 text-center">
        AI 건축 기획설계 보고서
      </h2>

      {/* 대지 정보 박스 */}
      <div className="border-2 border-gray-300 rounded-lg p-8 mb-16 min-w-[300px]">
        <div className="text-sm text-gray-500 mb-2">대지 위치</div>
        <div className="text-xl font-semibold text-gray-900">
          {report.landSummary.address}
        </div>
      </div>

      {/* 3D 이미지 영역 (플레이스홀더) */}
      {report.viewerSnapshots?.perspective && (
        <div className="w-full max-w-lg h-64 bg-gray-100 rounded-lg mb-16 flex items-center justify-center">
          <img
            src={report.viewerSnapshots.perspective}
            alt="3D 건물 뷰"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}

      {/* 작성일 */}
      <div className="text-gray-500 mb-4">
        작성일: {formatDate(report.createdAt)}
      </div>

      {/* 서비스명 */}
      <div className="text-blue-600 font-medium">
        ai-building-design.vercel.app
      </div>

      {/* 하단 장식선 */}
      <div className="w-full h-1 bg-blue-600 mt-16"></div>
    </div>
  )
}
