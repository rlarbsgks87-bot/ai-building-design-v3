// AI 건축 기획설계 보고서 타입 정의

// 대지 현황 정보
export interface LandSummary {
  address: string           // 대지 위치
  pnu: string              // 필지고유번호
  area: number             // 대지면적 (㎡)
  landCategory: string     // 지목
  useZone: string          // 용도지역
  useDistrict?: string     // 용도지구
  useArea?: string[]       // 용도구역
  otherRestrictions?: string[]  // 기타 토지이용계획
  maxCoverageRatio: number // 최대 건폐율 (%)
  maxFarRatio: number      // 최대 용적률 (%)
  landPrice: number        // 공시지가 (원/㎡)
  estimatedLandPrice?: number // 추정 토지가 (원)
  roadAccess: string       // 도로접면 (소로한면, 광대세각 등)
  terrainShape: string     // 지형형상 (세로장방, 가로장방 등)
  terrainHeight: string    // 지형높이 (평지, 경사 등)
}

// 계획 기준 (용도별)
export interface PlanStandard {
  use: string              // 용도 (다세대주택, 오피스텔 등)
  floors: number           // 층수
  floorHeight: number      // 층별 높이 (m)
  maxFarRatio: number      // 최대 용적률 (%)
  maxCoverageRatio: number // 최대 건폐율 (%)
  maxHeight?: number       // 최고 높이 (m)
  maxFloors?: number       // 최대 층수
}

// 건축 개요
export interface BuildingSummary {
  projectName: string      // 프로젝트명
  address: string          // 대지위치
  zoning: string           // 지역지구 (용도지역 전체)
  landArea: number         // 대지면적 (㎡)
  use: string              // 용도 (공동주택(다세대), 준주택(오피스텔) 등)
  scale: {
    floors: string         // 층수 (예: "지상5층", "지하5층, 지상12층")
    height: number         // 높이 (m)
  }
  buildingArea: number     // 건축면적 (㎡)
  totalFloorArea: {
    underground: number    // 지하층 연면적 (㎡)
    aboveGround: number    // 지상층 연면적 (㎡)
    total: number          // 합계 (㎡)
    forFarCalc: number     // 용적률 산정용 (㎡)
  }
  coverageRatio: number    // 건폐율 (%)
  farRatio: number         // 용적률 (%)
  landscapeArea?: number   // 조경면적 (㎡)
  landscapeRatio?: number  // 조경비율 (%)
  parking: ParkingPlan[]   // 주차계획
  planStandards: PlanStandard[]  // 계획기준
}

// 주차 계획
export interface ParkingPlan {
  use: string              // 용도
  count: number            // 대수
  type?: string            // 주차 타입 (지상/자주식지하 등)
}

// 용도별 면적표
export interface AreaByUse {
  use: string              // 용도
  exclusive: number        // 전용면적 (㎡)
  common: number           // 공용면적 (㎡)
  mechanical?: number      // 기전실 (㎡)
  subtotal: number         // 소계 (㎡)
  parking?: number         // 주차장 (㎡)
  total: number            // 합계 (㎡)
  landShare: number        // 대지지분 (㎡)
  useRatio: number         // 용도비율 (%)
  serviceArea?: number     // 서비스면적 (발코니 등)
}

// 분양 타입별 면적
export interface UnitType {
  typeName: string         // 타입명 (60타입, 24타입 등)
  unitCount: number        // 세대수
  unitRatio: number        // 비율 (%)
  exclusive: number        // 전용면적 (㎡)
  commonWall: number       // 공용-벽체 (㎡)
  commonGeneral: number    // 공용-일반 (㎡)
  supply: number           // 공급면적 (㎡)
  mechanical?: number      // 기전실 (㎡)
  parking?: number         // 주차장 (㎡)
  contract: number         // 계약면적 (㎡)
  service?: number         // 서비스면적 (발코니 등)
  landShare: number        // 대지지분 (㎡)
}

// 층별 면적표
export interface FloorArea {
  floor: number | string   // 층 (1, 2, B1, B2 등)
  areas: {
    use: string            // 용도
    exclusive: number      // 전용면적 (㎡)
    commonWall: number     // 공용-벽체 (㎡)
    commonGeneral: number  // 공용-일반 (㎡)
  }[]
  mechanical?: number      // 기전실 (㎡)
  parking?: number         // 주차장 (㎡)
  totalArea: number        // 바닥면적 (㎡)
  unitCount?: number       // 세대수
  floorHeight: number      // 층고 (m)
}

// 층별 타입별 세대수
export interface FloorUnitDistribution {
  floor: number | string   // 층
  types: Record<string, number>  // 타입별 세대수 (예: { "60 TYPE": 2, "47 TYPE": 1 })
  total: number            // 해당 층 총 세대수
}

// 분양 수입 항목
export interface SalesIncomeItem {
  use: string              // 용도
  typeName?: string        // 타입명
  floor?: number           // 층
  unitCount?: number       // 세대수
  area: number             // 면적 (㎡)
  pricePerSqm: number      // 1㎡당 분양가 (만원)
  totalPrice: number       // 금액 (만원)
}

// 임대 수입 항목
export interface RentalIncomeItem {
  use: string              // 용도
  typeName?: string        // 타입명
  floor?: number           // 층
  unitCount?: number       // 세대수
  area: number             // 면적 (㎡)
  monthlyRentPerSqm: number // 1㎡당 월 임대료 (만원)
  monthlyRent: number      // 월 임대료 (만원)
  annualRent: number       // 연 임대료 (만원)
}

// 지출 항목
export interface ExpenseItem {
  category: string         // 구분 (토지매입비, 공사비, 설계비 등)
  area?: number            // 면적 (㎡)
  pricePerSqm?: number     // 1㎡당 금액 (만원)
  multiplier?: number      // 보정계수 (공시지가 대비 배수)
  ratio?: string           // 비율 (예: "공사비의 5.66%")
  amount: number           // 금액 (만원)
}

// 사업성 검토
export interface FeasibilityAnalysis {
  income: {
    sales: SalesIncomeItem[]
    rental: RentalIncomeItem[]
    totalSales: number       // 총 분양 수입 (만원)
    totalMonthlyRental: number // 총 월 임대료 (만원)
    totalAnnualRental: number  // 총 연 임대료 (만원)
  }
  expenses: {
    items: ExpenseItem[]
    total: number            // 총 지출 (만원)
    otherExpenses: string[]  // 기타 고려해야 할 지출 항목
  }
  profit: {
    salesProfit: number      // 분양수익 (만원)
    salesProfitBillion?: string // 분양수익 (억원 표기)
    rentalYield: number      // 임대 연 수익률 (%)
  }
}

// 토지 가격 정보
export interface LandPriceInfo {
  officialPrice: number      // 공시지가 (억원)
  officialPricePerSqm: number // 공시지가 1㎡당 (만원)
  estimatedPrice: number     // 추정 토지가격 (억원)
  multiplier: number         // 공시지가 대비 배수
  comparables: {             // 주변 유사 거래 사례
    contractDate: string     // 계약일자
    address: string          // 주소
    actualPrice: number      // 실거래가 (억원)
    officialPrice: number    // 공시지가 (억원)
    multiplier: number       // 배수
  }[]
}

// 용도별 분양가/임대료 기준
export interface PriceStandards {
  salesPrices: {
    category: string         // 카테고리 (주거, 상업, 업무)
    items: {
      use: string            // 용도
      pricePerSqm: number    // 1㎡당 분양가 (만원)
    }[]
  }[]
  rentalPrices: {
    category: string         // 카테고리
    items: {
      use: string            // 용도
      monthlyRentPerSqm: number // 1㎡당 월 임대료 (만원)
    }[]
  }[]
}

// 법규 검토 항목
export interface LegalReviewItem {
  category: string           // 법규 카테고리 (주차 대수, 대지안의 공지 등)
  description: string        // 법규 설명
  requirement: string        // 법정 요구사항
  status: 'compliant' | 'non-compliant' | 'not-applicable'
}

// 법규 검토
export interface LegalReview {
  regions: string[]          // 적용 지역/지구 (도시지역, 제2종일반주거지역 등)
  items: LegalReviewItem[]
  references: string[]       // 관련 법령 참조
}

// 심의 검토 (제주도용)
export interface ReviewCheck {
  reviewType: string         // 심의 종류
  applicable: '해당없음' | '대상가능' | '확인필요' | '해당'
  schedule: string           // 심의 일정
  basis: string              // 관련 근거
}

// 기반시설 현황 (제주도용)
export interface InfrastructureStatus {
  facilityType: string       // 시설 종류
  available: '가능' | '확인필요' | '불가'
  location?: string          // 연결 위치
  note: string               // 비고
}

// 전체 보고서 데이터
export interface DesignReport {
  // 메타 정보
  id: string
  createdAt: string
  updatedAt: string
  reportType: 'planning' | 'analysis'  // 기획설계 / 대지분석

  // 프로젝트 기본 정보
  projectName: string
  projectType: string        // 공동주택(다세대), 복합시설 등

  // 대지 현황
  landSummary: LandSummary

  // 건축 개요
  buildingSummary: BuildingSummary

  // 면적 개요
  areaOverview: {
    byUse: AreaByUse[]
    unitTypes: Record<string, UnitType[]>  // 용도별 타입 분류
    byFloor: FloorArea[]
    floorDistribution?: FloorUnitDistribution[]
  }

  // 사업성 검토
  feasibility: FeasibilityAnalysis

  // 사업성 기초자료
  priceInfo: {
    landPrice: LandPriceInfo
    priceStandards: PriceStandards
  }

  // 법규 검토
  legalReview: LegalReview

  // 제주도 특화 (선택적)
  jejuSpecific?: {
    reviewChecks: ReviewCheck[]
    infrastructure: InfrastructureStatus[]
    buildableUses: {
      use: string
      available: '가능' | '조건부가능' | '불가'
      conditions?: string
    }[]
    contacts: {
      agency: string
      department: string
      phone: string
    }[]
  }

  // 3D 뷰어 스냅샷 (Base64 이미지)
  viewerSnapshots?: {
    perspective?: string
    front?: string
    top?: string
  }

  // 유의사항
  disclaimers: string[]
}

// 보고서 생성 입력 데이터
export interface ReportGenerationInput {
  landInfo: {
    pnu: string
    address: string
    area: number
    useZone: string
    useDistrict?: string
    maxCoverage: number
    maxFar: number
    heightLimit?: number
    landPrice: number
  }
  buildingConfig: {
    floors: number
    floorHeight: number
    setbacks: {
      front: number
      back: number
      left: number
      right: number
    }
    buildingArea: number
    totalFloorArea: number
    use: string
  }
  options?: {
    includeJejuSpecific?: boolean
    includeFeasibility?: boolean
    include3DSnapshots?: boolean
  }
}
