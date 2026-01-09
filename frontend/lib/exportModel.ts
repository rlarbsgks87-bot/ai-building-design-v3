/**
 * 3D 모델 내보내기 유틸리티
 *
 * OBJ, DXF, STEP 형식으로 건물 매스를 내보냅니다.
 * - OBJ: 범용 3D 메시 형식 (라이노, CAD, 3ds Max 등)
 * - DXF: AutoCAD 교환 형식 (CAD 최적화)
 * - STEP: ISO 10303 표준 (CAD/BIM 간 교환에 최적)
 */

// 건물 설정 인터페이스
interface BuildingConfig {
  id: string
  name: string
  floors: number
  floorHeight: number
  setbacks: { front: number; back: number; left: number; right: number }
  buildingArea: number
  totalFloorArea: number
  coverageRatio: number
  farRatio: number
}

// 층별 데이터
interface FloorData {
  floor: number
  width: number
  depth: number
  height: number
  centerX: number
  centerY: number  // 높이 (Z in CAD)
  centerZ: number  // 깊이 (Y in CAD)
  label: string
}

/**
 * 대지 크기 계산
 */
function calculateLandDimensions(
  area: number,
  dimensions?: { width: number; depth: number }
): { width: number; depth: number } {
  if (dimensions && dimensions.width > 0 && dimensions.depth > 0) {
    return { width: dimensions.width, depth: dimensions.depth }
  }
  const side = Math.sqrt(area)
  return { width: side, depth: side }
}

/**
 * 층별 데이터 계산 (MassViewer3D와 동일한 로직)
 */
function calculateFloorData(
  building: BuildingConfig,
  landDimensions: { width: number; depth: number },
  floorSetbacks?: number[],
  useZone?: string
): FloorData[] {
  const { width: landWidth, depth: landDepth } = landDimensions
  const isSteppedBuilding = floorSetbacks && floorSetbacks.length > 0
  const isResidential = useZone?.includes('주거')

  // 1층 기준 북측 이격거리
  const baseBackSetback = isSteppedBuilding && floorSetbacks?.[0]
    ? floorSetbacks[0]
    : building.setbacks.back

  // 건물 가용 영역
  const availableWidth = landWidth - building.setbacks.left - building.setbacks.right
  const buildingWidth = Math.max(3, availableWidth)

  // 건물 중심 X 위치
  const centerX = (building.setbacks.left - building.setbacks.right) / 2

  const floors: FloorData[] = []
  const hasRooftop = building.floors >= 3

  for (let i = 0; i < building.floors; i++) {
    const floorNum = i + 1
    const floorTopHeight = floorNum * building.floorHeight

    // 해당 층의 북측 이격거리
    let backSetback = baseBackSetback
    if (isSteppedBuilding && floorSetbacks?.[i] !== undefined) {
      backSetback = floorSetbacks[i]
    } else if (isResidential && floorTopHeight > 10) {
      backSetback = Math.max(floorTopHeight / 2, building.setbacks.back)
    }

    // 해당 층의 깊이
    const floorAvailableDepth = landDepth - building.setbacks.front - backSetback
    const floorDepth = Math.max(1, floorAvailableDepth)

    // 층 중심 Z 위치 (Three.js 기준)
    const floorStartZ = -landDepth / 2 + building.setbacks.front
    const floorCenterZ = floorStartZ + floorDepth / 2

    // 라벨
    let label = '주거'
    if (floorNum === 1) {
      label = '상가'
    } else if (hasRooftop && floorNum === building.floors) {
      label = '옥탑'
    }

    floors.push({
      floor: floorNum,
      width: buildingWidth,
      depth: floorDepth,
      height: building.floorHeight,
      centerX,
      centerY: i * building.floorHeight + building.floorHeight / 2,
      centerZ: floorCenterZ,
      label,
    })
  }

  return floors
}

/**
 * 박스의 8개 꼭짓점 계산
 * CAD 좌표계: Z-up (X, Y-forward, Z-up)
 * Three.js: Y-up (X, Y-up, Z-forward)
 */
function getBoxVertices(
  centerX: number,
  centerY: number,  // Three.js Y = CAD Z
  centerZ: number,  // Three.js Z = CAD Y
  width: number,
  height: number,
  depth: number
): number[][] {
  // Three.js → CAD 좌표 변환
  const cx = centerX
  const cy = centerZ  // Three.js Z → CAD Y
  const cz = centerY  // Three.js Y → CAD Z

  const hw = width / 2
  const hd = depth / 2   // CAD Y 방향
  const hh = height / 2  // CAD Z 방향

  // 8개 꼭짓점 (CAD 좌표계)
  return [
    [cx - hw, cy - hd, cz - hh],  // 0: 좌하전
    [cx + hw, cy - hd, cz - hh],  // 1: 우하전
    [cx + hw, cy + hd, cz - hh],  // 2: 우하후
    [cx - hw, cy + hd, cz - hh],  // 3: 좌하후
    [cx - hw, cy - hd, cz + hh],  // 4: 좌상전
    [cx + hw, cy - hd, cz + hh],  // 5: 우상전
    [cx + hw, cy + hd, cz + hh],  // 6: 우상후
    [cx - hw, cy + hd, cz + hh],  // 7: 좌상후
  ]
}

// ============================================================
// OBJ 내보내기
// ============================================================

/**
 * OBJ 형식으로 내보내기
 * MTL 파일도 함께 생성하여 색상 지원
 */
export function exportToOBJ(
  building: BuildingConfig,
  landArea: number,
  landDimensions?: { width: number; depth: number },
  floorSetbacks?: number[],
  useZone?: string,
  address?: string
): { obj: string; mtl: string } {
  const dims = calculateLandDimensions(landArea, landDimensions)
  const floors = calculateFloorData(building, dims, floorSetbacks, useZone)

  let objContent = `# AI 건축 기획설계 - 매스 스터디
# 주소: ${address || '미정'}
# 대지면적: ${landArea.toFixed(2)}㎡
# 건축면적: ${building.buildingArea.toFixed(2)}㎡
# 연면적: ${building.totalFloorArea.toFixed(2)}㎡
# 층수: ${building.floors}층
# 생성일시: ${new Date().toLocaleString('ko-KR')}

mtllib mass-study.mtl

`

  let mtlContent = `# AI 건축 기획설계 - 재질 파일

# 대지
newmtl Land
Kd 0.133 0.545 0.133
Ka 0.1 0.1 0.1
Ks 0.0 0.0 0.0
Ns 10

# 이격거리
newmtl Setback
Kd 0.961 0.620 0.043
Ka 0.1 0.1 0.1
Ks 0.0 0.0 0.0
Ns 10

# 1층 상가
newmtl Commercial
Kd 0.420 0.447 0.502
Ka 0.1 0.1 0.1
Ks 0.3 0.3 0.3
Ns 30

# 주거
newmtl Residential
Kd 0.231 0.510 0.965
Ka 0.1 0.1 0.1
Ks 0.3 0.3 0.3
Ns 30

# 옥탑
newmtl Rooftop
Kd 0.937 0.267 0.267
Ka 0.1 0.1 0.1
Ks 0.3 0.3 0.3
Ns 30

`

  let vertexIndex = 1

  // 대지 경계 (평면)
  const { width, depth } = dims
  objContent += `# 대지 경계\n`
  objContent += `o Land\n`
  objContent += `usemtl Land\n`
  objContent += `v ${-width / 2} ${-depth / 2} 0\n`
  objContent += `v ${width / 2} ${-depth / 2} 0\n`
  objContent += `v ${width / 2} ${depth / 2} 0\n`
  objContent += `v ${-width / 2} ${depth / 2} 0\n`
  objContent += `f ${vertexIndex} ${vertexIndex + 1} ${vertexIndex + 2} ${vertexIndex + 3}\n\n`
  vertexIndex += 4

  // 이격거리선 (평면, 약간 위)
  const actualSetbacks = {
    ...building.setbacks,
    back: floorSetbacks?.[0] ?? building.setbacks.back
  }
  objContent += `# 이격거리\n`
  objContent += `o Setback\n`
  objContent += `usemtl Setback\n`
  objContent += `v ${-width / 2 + actualSetbacks.left} ${-depth / 2 + actualSetbacks.front} 0.1\n`
  objContent += `v ${width / 2 - actualSetbacks.right} ${-depth / 2 + actualSetbacks.front} 0.1\n`
  objContent += `v ${width / 2 - actualSetbacks.right} ${depth / 2 - actualSetbacks.back} 0.1\n`
  objContent += `v ${-width / 2 + actualSetbacks.left} ${depth / 2 - actualSetbacks.back} 0.1\n`
  objContent += `f ${vertexIndex} ${vertexIndex + 1} ${vertexIndex + 2} ${vertexIndex + 3}\n\n`
  vertexIndex += 4

  // 층별 매스
  floors.forEach((floor) => {
    const vertices = getBoxVertices(
      floor.centerX,
      floor.centerY,
      floor.centerZ,
      floor.width,
      floor.height,
      floor.depth
    )

    const materialName = floor.label === '상가' ? 'Commercial' :
                         floor.label === '옥탑' ? 'Rooftop' : 'Residential'

    objContent += `# ${floor.floor}층 ${floor.label}\n`
    objContent += `o Floor_${floor.floor}_${floor.label}\n`
    objContent += `usemtl ${materialName}\n`

    // 꼭짓점
    vertices.forEach(([x, y, z]) => {
      objContent += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`
    })

    // 면 (반시계 방향, 1-indexed)
    const vi = vertexIndex
    // 하단면
    objContent += `f ${vi} ${vi + 3} ${vi + 2} ${vi + 1}\n`
    // 상단면
    objContent += `f ${vi + 4} ${vi + 5} ${vi + 6} ${vi + 7}\n`
    // 전면
    objContent += `f ${vi} ${vi + 1} ${vi + 5} ${vi + 4}\n`
    // 후면
    objContent += `f ${vi + 2} ${vi + 3} ${vi + 7} ${vi + 6}\n`
    // 좌측면
    objContent += `f ${vi} ${vi + 4} ${vi + 7} ${vi + 3}\n`
    // 우측면
    objContent += `f ${vi + 1} ${vi + 2} ${vi + 6} ${vi + 5}\n`
    objContent += `\n`

    vertexIndex += 8
  })

  return { obj: objContent, mtl: mtlContent }
}

// ============================================================
// DXF 내보내기
// ============================================================

/**
 * DXF 형식으로 내보내기 (AutoCAD 2018 호환)
 * 3D MESH 및 레이어 지원
 */
export function exportToDXF(
  building: BuildingConfig,
  landArea: number,
  landDimensions?: { width: number; depth: number },
  floorSetbacks?: number[],
  useZone?: string,
  address?: string
): string {
  const dims = calculateLandDimensions(landArea, landDimensions)
  const floors = calculateFloorData(building, dims, floorSetbacks, useZone)

  // DXF 헤더
  let dxf = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1027
9
$INSUNITS
70
6
9
$MEASUREMENT
70
1
0
ENDSEC
`

  // 테이블 섹션 (레이어 정의)
  dxf += `0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
6
`

  // 레이어 정의
  const layers = [
    { name: '대지경계', color: 3 },      // 녹색
    { name: '이격거리', color: 30 },     // 주황색
    { name: '1층_상가', color: 8 },      // 회색
    { name: '주거', color: 5 },          // 파란색
    { name: '옥탑', color: 1 },          // 빨간색
  ]

  layers.forEach(layer => {
    dxf += `0
LAYER
2
${layer.name}
70
0
62
${layer.color}
6
CONTINUOUS
`
  })

  dxf += `0
ENDTAB
0
ENDSEC
`

  // 엔티티 섹션
  dxf += `0
SECTION
2
ENTITIES
`

  const { width, depth } = dims

  // 대지 경계 (폴리라인)
  dxf += createDXFPolyline([
    [-width / 2, -depth / 2, 0],
    [width / 2, -depth / 2, 0],
    [width / 2, depth / 2, 0],
    [-width / 2, depth / 2, 0],
  ], '대지경계', true)

  // 이격거리선
  const actualSetbacks = {
    ...building.setbacks,
    back: floorSetbacks?.[0] ?? building.setbacks.back
  }
  dxf += createDXFPolyline([
    [-width / 2 + actualSetbacks.left, -depth / 2 + actualSetbacks.front, 0.1],
    [width / 2 - actualSetbacks.right, -depth / 2 + actualSetbacks.front, 0.1],
    [width / 2 - actualSetbacks.right, depth / 2 - actualSetbacks.back, 0.1],
    [-width / 2 + actualSetbacks.left, depth / 2 - actualSetbacks.back, 0.1],
  ], '이격거리', true)

  // 층별 매스 (3DFACE로 표현)
  floors.forEach((floor) => {
    const layerName = floor.label === '상가' ? '1층_상가' :
                      floor.label === '옥탑' ? '옥탑' : '주거'

    const vertices = getBoxVertices(
      floor.centerX,
      floor.centerY,
      floor.centerZ,
      floor.width,
      floor.height,
      floor.depth
    )

    // 각 면을 3DFACE로 생성
    // 하단면
    dxf += create3DFace(vertices[0], vertices[3], vertices[2], vertices[1], layerName)
    // 상단면
    dxf += create3DFace(vertices[4], vertices[5], vertices[6], vertices[7], layerName)
    // 전면
    dxf += create3DFace(vertices[0], vertices[1], vertices[5], vertices[4], layerName)
    // 후면
    dxf += create3DFace(vertices[2], vertices[3], vertices[7], vertices[6], layerName)
    // 좌측면
    dxf += create3DFace(vertices[0], vertices[4], vertices[7], vertices[3], layerName)
    // 우측면
    dxf += create3DFace(vertices[1], vertices[2], vertices[6], vertices[5], layerName)
  })

  // 정보 텍스트 (원점 근처)
  const infoText = [
    `AI 건축 기획설계 - 매스 스터디`,
    `주소: ${address || '미정'}`,
    `대지면적: ${landArea.toFixed(2)}m2`,
    `건축면적: ${building.buildingArea.toFixed(2)}m2`,
    `연면적: ${building.totalFloorArea.toFixed(2)}m2`,
    `층수: ${building.floors}층`,
    `건폐율: ${building.coverageRatio.toFixed(1)}%`,
    `용적률: ${building.farRatio.toFixed(1)}%`,
  ]

  infoText.forEach((text, i) => {
    dxf += createDXFText(text, -width / 2 - 5, -depth / 2 - 3 - i * 1.5, 0, 1, '대지경계')
  })

  dxf += `0
ENDSEC
0
EOF
`

  return dxf
}

/**
 * DXF 폴리라인 생성
 */
function createDXFPolyline(points: number[][], layerName: string, closed: boolean = false): string {
  let result = `0
POLYLINE
8
${layerName}
66
1
70
${closed ? 1 : 0}
`

  points.forEach(([x, y, z]) => {
    result += `0
VERTEX
8
${layerName}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
${z.toFixed(4)}
`
  })

  result += `0
SEQEND
`

  return result
}

/**
 * DXF 3DFACE 생성
 */
function create3DFace(
  p1: number[],
  p2: number[],
  p3: number[],
  p4: number[],
  layerName: string
): string {
  return `0
3DFACE
8
${layerName}
10
${p1[0].toFixed(4)}
20
${p1[1].toFixed(4)}
30
${p1[2].toFixed(4)}
11
${p2[0].toFixed(4)}
21
${p2[1].toFixed(4)}
31
${p2[2].toFixed(4)}
12
${p3[0].toFixed(4)}
22
${p3[1].toFixed(4)}
32
${p3[2].toFixed(4)}
13
${p4[0].toFixed(4)}
23
${p4[1].toFixed(4)}
33
${p4[2].toFixed(4)}
`
}

/**
 * DXF 텍스트 생성
 */
function createDXFText(
  text: string,
  x: number,
  y: number,
  z: number,
  height: number,
  layerName: string
): string {
  return `0
TEXT
8
${layerName}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
${z.toFixed(4)}
40
${height.toFixed(4)}
1
${text}
`
}

// ============================================================
// 다운로드 함수
// ============================================================

/**
 * OBJ 파일 다운로드
 */
export function downloadOBJ(
  building: BuildingConfig,
  landArea: number,
  landDimensions?: { width: number; depth: number },
  floorSetbacks?: number[],
  useZone?: string,
  address?: string,
  filename?: string
): void {
  const { obj, mtl } = exportToOBJ(
    building,
    landArea,
    landDimensions,
    floorSetbacks,
    useZone,
    address
  )

  const baseName = filename || `mass-study-${building.name || 'building'}`

  // OBJ 파일 다운로드
  downloadFile(obj, `${baseName}.obj`, 'text/plain')

  // MTL 파일 다운로드 (약간의 지연)
  setTimeout(() => {
    downloadFile(mtl, `mass-study.mtl`, 'text/plain')
  }, 100)
}

/**
 * DXF 파일 다운로드
 */
export function downloadDXF(
  building: BuildingConfig,
  landArea: number,
  landDimensions?: { width: number; depth: number },
  floorSetbacks?: number[],
  useZone?: string,
  address?: string,
  filename?: string
): void {
  const dxf = exportToDXF(
    building,
    landArea,
    landDimensions,
    floorSetbacks,
    useZone,
    address
  )

  const baseName = filename || `mass-study-${building.name || 'building'}`
  downloadFile(dxf, `${baseName}.dxf`, 'application/dxf')
}

/**
 * 파일 다운로드 헬퍼
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

// ============================================================
// STEP 내보내기 (ISO 10303 AP214)
// ============================================================

// STEP 엔티티 ID 카운터
let stepEntityId = 0

function resetStepEntityId(): void {
  stepEntityId = 0
}

function nextStepId(): number {
  return ++stepEntityId
}

/**
 * STEP 형식으로 내보내기 (AP214 Automotive Design)
 * 라이노, SolidWorks, CATIA 등에서 열 수 있음
 */
export function exportToSTEP(
  building: BuildingConfig,
  landArea: number,
  landDimensions?: { width: number; depth: number },
  floorSetbacks?: number[],
  useZone?: string,
  address?: string
): string {
  resetStepEntityId()

  const dims = calculateLandDimensions(landArea, landDimensions)
  const floors = calculateFloorData(building, dims, floorSetbacks, useZone)

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0]
  const filename = `mass-study-${building.name || 'building'}`

  // STEP 파일 헤더
  let step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('AI Building Design - Mass Study'),'2;1');
FILE_NAME('${filename}.step','${timestamp}',('AI Building Design'),(''),
  'AI Building Design Export','AI Building Design','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
`

  // 기본 엔티티들
  const appContextId = nextStepId()
  const appProtocolId = nextStepId()
  const prodContextId = nextStepId()
  const geomContextId = nextStepId()
  const repContextId = nextStepId()
  const globalUncertaintyId = nextStepId()
  const lengthUnitId = nextStepId()
  const planeAngleUnitId = nextStepId()
  const solidAngleUnitId = nextStepId()
  const namedUnitId1 = nextStepId()
  const namedUnitId2 = nextStepId()
  const namedUnitId3 = nextStepId()
  const conversionId = nextStepId()
  const siUnitId = nextStepId()

  step += `#${appContextId}=APPLICATION_CONTEXT('automotive_design');
#${appProtocolId}=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2010,#${appContextId});
#${prodContextId}=PRODUCT_CONTEXT('',#${appContextId},'mechanical');
#${geomContextId}=GEOMETRIC_REPRESENTATION_CONTEXT(3);
#${repContextId}=(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${globalUncertaintyId})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lengthUnitId},#${planeAngleUnitId},#${solidAngleUnitId})) REPRESENTATION_CONTEXT('Context #1','3D Context with TORTURE://1. UNCERTAINTY'));
#${globalUncertaintyId}=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${lengthUnitId},'distance_accuracy_value','confusion accuracy');
#${lengthUnitId}=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));
#${planeAngleUnitId}=(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.));
#${solidAngleUnitId}=(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT());
`

  // 각 층별로 박스 솔리드 생성
  const productIds: number[] = []
  const shapeRepIds: number[] = []

  floors.forEach((floor, idx) => {
    const boxData = createSTEPBox(
      floor.centerX,
      floor.centerY,  // height (Z in CAD)
      floor.centerZ,  // depth (Y in CAD)
      floor.width,
      floor.height,
      floor.depth,
      `Floor_${floor.floor}_${floor.label}`,
      repContextId
    )
    step += boxData.entities

    // Product 정의
    const productId = nextStepId()
    const prodDefFormId = nextStepId()
    const prodDefId = nextStepId()
    const prodDefShapeId = nextStepId()
    const shapeRepRelId = nextStepId()

    step += `#${productId}=PRODUCT('Floor_${floor.floor}','${floor.label}','',(#${prodContextId}));
#${prodDefFormId}=PRODUCT_DEFINITION_FORMATION('','',#${productId});
#${prodDefId}=PRODUCT_DEFINITION('design','',#${prodDefFormId},#${prodContextId});
#${prodDefShapeId}=PRODUCT_DEFINITION_SHAPE('','Shape for Floor_${floor.floor}',#${prodDefId});
#${shapeRepRelId}=SHAPE_DEFINITION_REPRESENTATION(#${prodDefShapeId},#${boxData.shapeRepId});
`

    productIds.push(productId)
    shapeRepIds.push(boxData.shapeRepId)
  })

  step += `ENDSEC;
END-ISO-10303-21;
`

  return step
}

/**
 * STEP 박스 솔리드 생성
 */
function createSTEPBox(
  centerX: number,
  centerY: number,  // Three.js Y = CAD Z
  centerZ: number,  // Three.js Z = CAD Y
  width: number,
  height: number,
  depth: number,
  name: string,
  repContextId: number
): { entities: string; shapeRepId: number } {
  // Three.js → CAD 좌표 변환
  const cx = centerX * 1000  // m → mm
  const cy = centerZ * 1000  // Three.js Z → CAD Y
  const cz = centerY * 1000  // Three.js Y → CAD Z

  const hw = (width / 2) * 1000
  const hd = (depth / 2) * 1000   // CAD Y 방향
  const hh = (height / 2) * 1000  // CAD Z 방향

  let entities = ''

  // 8개 꼭짓점 생성
  const vertexIds: number[] = []
  const cartesianPoints = [
    [cx - hw, cy - hd, cz - hh],  // 0
    [cx + hw, cy - hd, cz - hh],  // 1
    [cx + hw, cy + hd, cz - hh],  // 2
    [cx - hw, cy + hd, cz - hh],  // 3
    [cx - hw, cy - hd, cz + hh],  // 4
    [cx + hw, cy - hd, cz + hh],  // 5
    [cx + hw, cy + hd, cz + hh],  // 6
    [cx - hw, cy + hd, cz + hh],  // 7
  ]

  const cartesianPointIds: number[] = []
  cartesianPoints.forEach(([x, y, z]) => {
    const cpId = nextStepId()
    entities += `#${cpId}=CARTESIAN_POINT('',(${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}));
`
    cartesianPointIds.push(cpId)

    const vpId = nextStepId()
    entities += `#${vpId}=VERTEX_POINT('',#${cpId});
`
    vertexIds.push(vpId)
  })

  // 방향 벡터
  const dirZId = nextStepId()
  const dirXId = nextStepId()
  const dirYId = nextStepId()
  const dirNegZId = nextStepId()
  const dirNegXId = nextStepId()
  const dirNegYId = nextStepId()

  entities += `#${dirZId}=DIRECTION('',(0.,0.,1.));
#${dirXId}=DIRECTION('',(1.,0.,0.));
#${dirYId}=DIRECTION('',(0.,1.,0.));
#${dirNegZId}=DIRECTION('',(0.,0.,-1.));
#${dirNegXId}=DIRECTION('',(-1.,0.,0.));
#${dirNegYId}=DIRECTION('',(0.,-1.,0.));
`

  // 원점
  const originId = nextStepId()
  entities += `#${originId}=CARTESIAN_POINT('',(0.,0.,0.));
`

  // Axis2 Placement 3D (각 면에 대한 로컬 좌표계)
  const axis2PlacementIds: { [key: string]: number } = {}

  // 하단면 (Z-)
  const bottomAxisId = nextStepId()
  const bottomCenterId = nextStepId()
  entities += `#${bottomCenterId}=CARTESIAN_POINT('',(${cx.toFixed(4)},${cy.toFixed(4)},${(cz - hh).toFixed(4)}));
#${bottomAxisId}=AXIS2_PLACEMENT_3D('',#${bottomCenterId},#${dirNegZId},#${dirXId});
`
  axis2PlacementIds['bottom'] = bottomAxisId

  // 상단면 (Z+)
  const topAxisId = nextStepId()
  const topCenterId = nextStepId()
  entities += `#${topCenterId}=CARTESIAN_POINT('',(${cx.toFixed(4)},${cy.toFixed(4)},${(cz + hh).toFixed(4)}));
#${topAxisId}=AXIS2_PLACEMENT_3D('',#${topCenterId},#${dirZId},#${dirXId});
`
  axis2PlacementIds['top'] = topAxisId

  // 전면 (Y-)
  const frontAxisId = nextStepId()
  const frontCenterId = nextStepId()
  entities += `#${frontCenterId}=CARTESIAN_POINT('',(${cx.toFixed(4)},${(cy - hd).toFixed(4)},${cz.toFixed(4)}));
#${frontAxisId}=AXIS2_PLACEMENT_3D('',#${frontCenterId},#${dirNegYId},#${dirXId});
`
  axis2PlacementIds['front'] = frontAxisId

  // 후면 (Y+)
  const backAxisId = nextStepId()
  const backCenterId = nextStepId()
  entities += `#${backCenterId}=CARTESIAN_POINT('',(${cx.toFixed(4)},${(cy + hd).toFixed(4)},${cz.toFixed(4)}));
#${backAxisId}=AXIS2_PLACEMENT_3D('',#${backCenterId},#${dirYId},#${dirXId});
`
  axis2PlacementIds['back'] = backAxisId

  // 좌측면 (X-)
  const leftAxisId = nextStepId()
  const leftCenterId = nextStepId()
  entities += `#${leftCenterId}=CARTESIAN_POINT('',(${(cx - hw).toFixed(4)},${cy.toFixed(4)},${cz.toFixed(4)}));
#${leftAxisId}=AXIS2_PLACEMENT_3D('',#${leftCenterId},#${dirNegXId},#${dirYId});
`
  axis2PlacementIds['left'] = leftAxisId

  // 우측면 (X+)
  const rightAxisId = nextStepId()
  const rightCenterId = nextStepId()
  entities += `#${rightCenterId}=CARTESIAN_POINT('',(${(cx + hw).toFixed(4)},${cy.toFixed(4)},${cz.toFixed(4)}));
#${rightAxisId}=AXIS2_PLACEMENT_3D('',#${rightCenterId},#${dirXId},#${dirYId});
`
  axis2PlacementIds['right'] = rightAxisId

  // 간단한 Faceted BREP 사용 (메시 기반)
  // 6개 면 생성
  const faceIds: number[] = []

  // 면 정의 함수
  const createPlaneFace = (v1: number, v2: number, v3: number, v4: number, axisId: number): number => {
    // 에지들 생성
    const line1Id = nextStepId()
    const line2Id = nextStepId()
    const line3Id = nextStepId()
    const line4Id = nextStepId()

    entities += `#${line1Id}=LINE('',#${cartesianPointIds[v1]},#${nextStepId()}=VECTOR('',#${dirXId},1.));
#${line2Id}=LINE('',#${cartesianPointIds[v2]},#${nextStepId()}=VECTOR('',#${dirYId},1.));
#${line3Id}=LINE('',#${cartesianPointIds[v3]},#${nextStepId()}=VECTOR('',#${dirNegXId},1.));
#${line4Id}=LINE('',#${cartesianPointIds[v4]},#${nextStepId()}=VECTOR('',#${dirNegYId},1.));
`

    // 평면
    const planeId = nextStepId()
    entities += `#${planeId}=PLANE('',#${axisId});
`

    // Advanced Face
    const faceId = nextStepId()
    entities += `#${faceId}=ADVANCED_FACE('',(#${nextStepId()}=FACE_OUTER_BOUND('',#${nextStepId()}=EDGE_LOOP('',(
#${nextStepId()}=ORIENTED_EDGE('',*,*,#${nextStepId()}=EDGE_CURVE('',#${vertexIds[v1]},#${vertexIds[v2]},#${line1Id},.T.),.T.),
#${nextStepId()}=ORIENTED_EDGE('',*,*,#${nextStepId()}=EDGE_CURVE('',#${vertexIds[v2]},#${vertexIds[v3]},#${line2Id},.T.),.T.),
#${nextStepId()}=ORIENTED_EDGE('',*,*,#${nextStepId()}=EDGE_CURVE('',#${vertexIds[v3]},#${vertexIds[v4]},#${line3Id},.T.),.T.),
#${nextStepId()}=ORIENTED_EDGE('',*,*,#${nextStepId()}=EDGE_CURVE('',#${vertexIds[v4]},#${vertexIds[v1]},#${line4Id},.T.),.T.)
)),.T.)),#${planeId},.T.);
`
    return faceId
  }

  // 6개 면 (하단, 상단, 전면, 후면, 좌측, 우측)
  // 하단면: 0-1-2-3
  faceIds.push(createPlaneFace(0, 1, 2, 3, axis2PlacementIds['bottom']))
  // 상단면: 4-7-6-5
  faceIds.push(createPlaneFace(4, 7, 6, 5, axis2PlacementIds['top']))
  // 전면: 0-4-5-1
  faceIds.push(createPlaneFace(0, 4, 5, 1, axis2PlacementIds['front']))
  // 후면: 2-6-7-3
  faceIds.push(createPlaneFace(2, 6, 7, 3, axis2PlacementIds['back']))
  // 좌측면: 0-3-7-4
  faceIds.push(createPlaneFace(0, 3, 7, 4, axis2PlacementIds['left']))
  // 우측면: 1-5-6-2
  faceIds.push(createPlaneFace(1, 5, 6, 2, axis2PlacementIds['right']))

  // Closed Shell
  const closedShellId = nextStepId()
  entities += `#${closedShellId}=CLOSED_SHELL('',(${faceIds.map(id => `#${id}`).join(',')}));
`

  // Manifold Solid BREP
  const solidId = nextStepId()
  entities += `#${solidId}=MANIFOLD_SOLID_BREP('${name}',#${closedShellId});
`

  // Shape Representation
  const shapeRepId = nextStepId()
  entities += `#${shapeRepId}=SHAPE_REPRESENTATION('${name}',(#${solidId}),#${repContextId});
`

  return { entities, shapeRepId }
}

/**
 * STEP 파일 다운로드
 */
export function downloadSTEP(
  building: BuildingConfig,
  landArea: number,
  landDimensions?: { width: number; depth: number },
  floorSetbacks?: number[],
  useZone?: string,
  address?: string,
  filename?: string
): void {
  const step = exportToSTEP(
    building,
    landArea,
    landDimensions,
    floorSetbacks,
    useZone,
    address
  )

  const baseName = filename || `mass-study-${building.name || 'building'}`
  downloadFile(step, `${baseName}.step`, 'application/step')
}
