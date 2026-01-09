'use client'

import { useState, useEffect, Suspense, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ReportCover } from '@/components/Report/ReportCover'
import { LandSummarySection } from '@/components/Report/LandSummarySection'
import { BuildingSummarySection } from '@/components/Report/BuildingSummarySection'
import { AreaOverviewSection } from '@/components/Report/AreaOverviewSection'
import { FeasibilitySection } from '@/components/Report/FeasibilitySection'
import { LegalReviewSection } from '@/components/Report/LegalReviewSection'
import { DisclaimerSection } from '@/components/Report/DisclaimerSection'
import type { DesignReport } from '@/types/report'

// 샘플 보고서 데이터 생성
function generateSampleReport(params: URLSearchParams): DesignReport {
  const address = params.get('address') || '제주특별자치도 제주시 도남동 50-11'
  const pnu = params.get('pnu') || '5011012900100500011'
  const landArea = parseFloat(params.get('landArea') || '277.6')
  const floors = parseInt(params.get('floors') || '4')
  const floorHeight = parseFloat(params.get('floorHeight') || '3.0')
  const buildingArea = parseFloat(params.get('buildingArea') || '166.56')
  const useZone = params.get('useZone') || '제2종일반주거지역'

  const totalFloorArea = buildingArea * floors
  const coverageRatio = (buildingArea / landArea) * 100
  const farRatio = (totalFloorArea / landArea) * 100

  return {
    id: `report-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reportType: 'planning',
    projectName: `${address.split(' ').slice(-1)[0]} 공동주택(다세대) 개발사업`,
    projectType: '공동주택(다세대)',

    landSummary: {
      address,
      pnu,
      area: landArea,
      landCategory: '대',
      useZone,
      useDistrict: '고도지구',
      useArea: ['상대보호구역', '장애물제한표면구역', '가축사육제한구역', '지하수자원특별관리구역', '하수처리구역'],
      otherRestrictions: ['소로2류(폭 8m~10m)'],
      maxCoverageRatio: 60,
      maxFarRatio: 250,
      landPrice: 776300,
      estimatedLandPrice: Math.round(landArea * 776300 * 1.0),
      roadAccess: '소로한면',
      terrainShape: '세로장방',
      terrainHeight: '평지',
    },

    buildingSummary: {
      projectName: `${address.split(' ').slice(-1)[0]} 공동주택(다세대) 개발사업`,
      address,
      zoning: `도시지역, ${useZone}, 고도지구, 상대보호구역`,
      landArea,
      use: '공동주택(다세대)',
      scale: {
        floors: `지상${floors}층`,
        height: floors * floorHeight,
      },
      buildingArea,
      totalFloorArea: {
        underground: 0,
        aboveGround: totalFloorArea,
        total: totalFloorArea,
        forFarCalc: totalFloorArea,
      },
      coverageRatio: Math.round(coverageRatio * 10) / 10,
      farRatio: Math.round(farRatio * 10) / 10,
      landscapeArea: Math.round(landArea * 0.05 * 10) / 10,
      landscapeRatio: 5,
      parking: [
        { use: '다세대주택', count: Math.ceil(totalFloorArea / 75), type: '지상' }
      ],
      planStandards: [
        {
          use: '다세대주택',
          floors,
          floorHeight,
          maxFarRatio: 250,
          maxCoverageRatio: 60,
          maxHeight: 30,
          maxFloors: 7,
        }
      ],
    },

    areaOverview: {
      byUse: [
        {
          use: '공동주택(다세대)',
          exclusive: Math.round(totalFloorArea * 0.72 * 100) / 100,
          common: Math.round(totalFloorArea * 0.28 * 100) / 100,
          subtotal: totalFloorArea,
          total: totalFloorArea,
          landShare: landArea,
          useRatio: 100,
          serviceArea: Math.round(totalFloorArea * 0.15 * 100) / 100,
        }
      ],
      unitTypes: {
        '공동주택(다세대)': [
          {
            typeName: '60 타입',
            unitCount: Math.floor(floors * 0.4),
            unitRatio: 40,
            exclusive: 60.86,
            commonWall: 4.87,
            commonGeneral: 18.62,
            supply: 84.35,
            contract: 84.35,
            service: 12.17,
            landShare: Math.round(landArea / floors * 0.4 * 100) / 100,
          },
          {
            typeName: '47 타입',
            unitCount: Math.ceil(floors * 0.6),
            unitRatio: 60,
            exclusive: 47.47,
            commonWall: 3.80,
            commonGeneral: 14.52,
            supply: 65.79,
            contract: 65.79,
            service: 9.49,
            landShare: Math.round(landArea / floors * 0.6 * 100) / 100,
          }
        ]
      },
      byFloor: Array.from({ length: floors }, (_, i) => ({
        floor: floors - i,
        areas: [{
          use: '공동주택(다세대)',
          exclusive: Math.round(buildingArea * 0.72 * 100) / 100,
          commonWall: Math.round(buildingArea * 0.05 * 100) / 100,
          commonGeneral: Math.round(buildingArea * 0.23 * 100) / 100,
        }],
        totalArea: buildingArea,
        unitCount: floors - i === 1 ? 0 : 2,
        floorHeight,
      })),
    },

    feasibility: {
      income: {
        sales: [
          {
            use: '공동주택(다세대)',
            typeName: '60 타입',
            unitCount: Math.floor(floors * 0.4),
            area: 84.35 * Math.floor(floors * 0.4),
            pricePerSqm: 897,
            totalPrice: Math.round(84.35 * Math.floor(floors * 0.4) * 897),
          },
          {
            use: '공동주택(다세대)',
            typeName: '47 타입',
            unitCount: Math.ceil(floors * 0.6),
            area: 65.79 * Math.ceil(floors * 0.6),
            pricePerSqm: 897,
            totalPrice: Math.round(65.79 * Math.ceil(floors * 0.6) * 897),
          }
        ],
        rental: [
          {
            use: '공동주택(다세대)',
            typeName: '60 타입',
            unitCount: Math.floor(floors * 0.4),
            area: 84.35 * Math.floor(floors * 0.4),
            monthlyRentPerSqm: 2.9,
            monthlyRent: Math.round(84.35 * Math.floor(floors * 0.4) * 2.9),
            annualRent: Math.round(84.35 * Math.floor(floors * 0.4) * 2.9 * 12),
          }
        ],
        totalSales: Math.round(totalFloorArea * 897),
        totalMonthlyRental: Math.round(totalFloorArea * 2.9),
        totalAnnualRental: Math.round(totalFloorArea * 2.9 * 12),
      },
      expenses: {
        items: [
          {
            category: '토지매입비',
            area: landArea,
            pricePerSqm: 776.3,
            multiplier: 1.0,
            amount: Math.round(landArea * 776.3),
          },
          {
            category: '공사비',
            area: totalFloorArea,
            pricePerSqm: 239,
            amount: Math.round(totalFloorArea * 239),
          },
          {
            category: '설계비',
            ratio: '공사비의 5.66%',
            amount: Math.round(totalFloorArea * 239 * 0.0566),
          },
          {
            category: '감리비',
            ratio: '공사비의 1.13%',
            amount: Math.round(totalFloorArea * 239 * 0.0113),
          }
        ],
        total: Math.round(landArea * 776.3 + totalFloorArea * 239 * 1.0679),
        otherExpenses: [
          '토지관련: 명도비용, 취득세 및 등록세(4.6%), 국민주택채권 등',
          '판매비: 모델하우스 관련, 광고홍보비, 분양수수료 등',
          '일반관리비: 입주관리비, 상하수도 부담금, 시행사일반관리비 등',
          '금융비: 금융주관수수료, 대출이자, 취급수수료 등',
          '기타: 기존 건축물 철거비, 인입공사부담금, 개발부담금 등'
        ],
      },
      profit: {
        salesProfit: Math.round(totalFloorArea * 897 - (landArea * 776.3 + totalFloorArea * 239 * 1.0679)),
        rentalYield: Math.round((totalFloorArea * 2.9 * 12) / (landArea * 776.3 + totalFloorArea * 239 * 1.0679) * 10000) / 100,
      }
    },

    priceInfo: {
      landPrice: {
        officialPrice: Math.round(landArea * 776300 / 100000000 * 10) / 10,
        officialPricePerSqm: 77.63,
        estimatedPrice: Math.round(landArea * 776300 / 100000000 * 10) / 10,
        multiplier: 1.0,
        comparables: [],
      },
      priceStandards: {
        salesPrices: [
          {
            category: '주거',
            items: [
              { use: '다세대/연립', pricePerSqm: 897 },
              { use: '아파트', pricePerSqm: 1028 },
              { use: '오피스텔', pricePerSqm: 1201 },
            ]
          }
        ],
        rentalPrices: [
          {
            category: '주거',
            items: [
              { use: '다세대/연립', monthlyRentPerSqm: 3 },
              { use: '아파트', monthlyRentPerSqm: 3 },
              { use: '오피스텔', monthlyRentPerSqm: 4 },
            ]
          }
        ],
      }
    },

    legalReview: {
      regions: ['도시지역', useZone, '고도지구'],
      items: [
        {
          category: '주차 대수',
          description: '전용면적 75㎡당 1대',
          requirement: `${Math.ceil(totalFloorArea * 0.72 / 75)}대 이상`,
          status: 'compliant',
        },
        {
          category: '대지안의 공지(인접대지경계선)',
          description: '공동주택(다세대) 1.0m 이상 이격',
          requirement: '1.0m',
          status: 'compliant',
        },
        {
          category: '대지안의 공지(건축선)',
          description: '공동주택(다세대) 1.0m 이상 이격',
          requirement: '1.0m',
          status: 'compliant',
        },
        {
          category: '정북일조',
          description: '높이 9m 이하: 1.5m, 높이 9m 초과: 각 부분 높이의 1:2 이상',
          requirement: '적용',
          status: 'compliant',
        },
        {
          category: '조경면적',
          description: `연면적 ${totalFloorArea < 1000 ? '1,000㎡ 미만' : '1,000㎡ 이상'}`,
          requirement: `${Math.round(landArea * 0.05 * 10) / 10}㎡(5%)`,
          status: 'compliant',
        },
      ],
      references: [
        '건축법 제61조(일조 등의 확보를 위한 건축물의 높이 제한)',
        '건축법 시행령 제86조(일조 등의 확보를 위한 건축물의 높이 제한)',
        '주차장법 제19조(부설주차장의 설치)',
        '건축법 제58조(대지 안의 공지)',
      ],
    },

    jejuSpecific: {
      reviewChecks: [
        { reviewType: '건축심의', applicable: '해당없음', schedule: '매주 목요일', basis: '건축법' },
        { reviewType: '구조심의', applicable: '해당없음', schedule: '매주 수요일', basis: '건축법 제4조 (특수구조 건축물)' },
        { reviewType: '경관심의', applicable: totalFloorArea >= 3000 || floors >= 6 ? '대상가능' : '해당없음', schedule: '매월 2회', basis: '제주도 경관조례 제18조' },
        { reviewType: '도로지정', applicable: '확인필요', schedule: '매주 화요일 접수', basis: '건축법 제45조' },
        { reviewType: '도시계획심의', applicable: '해당없음', schedule: '월 2회', basis: '국토계획법 제59조' },
      ],
      infrastructure: [
        { facilityType: '상수시설', available: '확인필요', note: '읍면사무소 확인' },
        { facilityType: '하수시설', available: '확인필요', note: '상하수도과 확인' },
        { facilityType: '도로시설', available: '확인필요', note: '현황 확인 필요' },
        { facilityType: '전기시설', available: '확인필요', note: '한전 확인' },
      ],
      buildableUses: [
        { use: '단독주택', available: '가능' },
        { use: '공동주택', available: '가능' },
        { use: '근린생활시설', available: '가능', conditions: '제1종, 제2종' },
        { use: '숙박시설', available: '조건부가능', conditions: '일반숙박시설 제외' },
        { use: '공장', available: '불가' },
        { use: '창고시설', available: '불가' },
      ],
      contacts: [
        { agency: '제주시청', department: '건축과', phone: '064-728-3534' },
        { agency: '제주시청', department: '도시계획과', phone: '064-728-3532' },
        { agency: '제주도청', department: '건축경관과(심의)', phone: '064-710-3776' },
      ],
    },

    disclaimers: [
      '본 보고서는 참고용이며 법적 효력이 없습니다.',
      '정확한 정보는 토지이음(eum.go.kr) 또는 관할 행정기관에서 확인하시기 바랍니다.',
      '개별 법령, 지구단위계획, 조례 개정 등에 따라 내용이 변경될 수 있습니다.',
      '본 기획설계안에 적용된 세부 법규는 실제와 다를 수 있으며, 정확한 검토가 필요합니다.',
    ],
  }
}

function ReportContent() {
  const searchParams = useSearchParams()
  const [report, setReport] = useState<DesignReport | null>(null)
  const [activeSection, setActiveSection] = useState('cover')
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const generatedReport = generateSampleReport(params)
    setReport(generatedReport)
  }, [searchParams])

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = useCallback(async () => {
    if (!reportRef.current || !report) return

    setIsGeneratingPDF(true)

    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      const sections = reportRef.current.querySelectorAll('section')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = 210
      const pageHeight = 297

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i] as HTMLElement

        const canvas = await html2canvas(section, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        })

        const imgData = canvas.toDataURL('image/jpeg', 0.95)
        const imgWidth = pageWidth
        const imgHeight = (canvas.height * imgWidth) / canvas.width

        if (i > 0) {
          pdf.addPage()
        }

        // 페이지보다 이미지가 길면 비율 조정
        if (imgHeight > pageHeight) {
          const ratio = pageHeight / imgHeight
          pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth * ratio, pageHeight)
        } else {
          pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight)
        }
      }

      const fileName = `AI건축기획설계_${report.projectName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(fileName)
    } catch (error) {
      console.error('PDF 생성 오류:', error)
      alert('PDF 생성 중 오류가 발생했습니다. 프린트 기능을 사용해 주세요.')
    } finally {
      setIsGeneratingPDF(false)
    }
  }, [report])

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">보고서 생성 중...</p>
        </div>
      </div>
    )
  }

  const sections = [
    { id: 'cover', label: '표지' },
    { id: 'land', label: '대지 현황' },
    { id: 'building', label: '계획 건축개요' },
    { id: 'area', label: '면적 개요' },
    { id: 'feasibility', label: '사업성 검토' },
    { id: 'legal', label: '법규 검토' },
    { id: 'disclaimer', label: '유의사항' },
  ]

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 네비게이션 (프린트 시 숨김) */}
      <nav className="fixed top-0 left-0 right-0 bg-white shadow-md z-50 print:hidden">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <Link href="/design" className="text-gray-600 hover:text-gray-900">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <h1 className="font-bold text-gray-900">AI 건축 기획설계 보고서</h1>
            </div>

            {/* 섹션 네비게이션 */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id)
                    document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className={`px-3 py-1.5 text-sm rounded whitespace-nowrap transition-colors ${
                    activeSection === section.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingPDF ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    PDF 생성 중...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    PDF 다운로드
                  </>
                )}
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                프린트
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 보고서 내용 */}
      <div ref={reportRef} className="pt-16 print:pt-0">
        <div className="max-w-[210mm] mx-auto bg-white shadow-lg print:shadow-none">
          {/* 표지 */}
          <section id="cover" className="print:break-after-page">
            <ReportCover report={report} />
          </section>

          {/* 대지 현황 */}
          <section id="land" className="print:break-after-page">
            <LandSummarySection landSummary={report.landSummary} jejuSpecific={report.jejuSpecific} />
          </section>

          {/* 계획 건축개요 */}
          <section id="building" className="print:break-after-page">
            <BuildingSummarySection buildingSummary={report.buildingSummary} />
          </section>

          {/* 면적 개요 */}
          <section id="area" className="print:break-after-page">
            <AreaOverviewSection areaOverview={report.areaOverview} />
          </section>

          {/* 사업성 검토 */}
          <section id="feasibility" className="print:break-after-page">
            <FeasibilitySection feasibility={report.feasibility} priceInfo={report.priceInfo} />
          </section>

          {/* 법규 검토 */}
          <section id="legal" className="print:break-after-page">
            <LegalReviewSection legalReview={report.legalReview} />
          </section>

          {/* 유의사항 */}
          <section id="disclaimer">
            <DisclaimerSection disclaimers={report.disclaimers} />
          </section>
        </div>
      </div>

      {/* 프린트 스타일 */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print\\:break-after-page {
            break-after: page;
          }

          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export default function ReportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">보고서 페이지 로딩 중...</p>
        </div>
      </div>
    }>
      <ReportContent />
    </Suspense>
  )
}
