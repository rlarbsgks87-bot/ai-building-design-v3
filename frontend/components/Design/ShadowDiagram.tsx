'use client'

import { useMemo } from 'react'

interface ShadowDiagramProps {
  buildingWidth: number   // 건물 가로 (m)
  buildingDepth: number   // 건물 세로 (m)
  buildingHeight: number  // 건물 높이 (m)
  latitude?: number       // 위도 (기본값: 제주 33.5)
}

// 태양 고도각 계산 (간략화된 공식)
// 동지 기준 (태양 적위 -23.45도)
function getSunAltitude(hour: number, latitude: number): number {
  const solarDeclination = -23.45 // 동지 태양 적위
  const hourAngle = (hour - 12) * 15 // 시간각 (정오 기준)

  const latRad = (latitude * Math.PI) / 180
  const decRad = (solarDeclination * Math.PI) / 180
  const hourRad = (hourAngle * Math.PI) / 180

  const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
                 Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourRad)

  return Math.asin(sinAlt) * (180 / Math.PI)
}

// 태양 방위각 계산
function getSunAzimuth(hour: number, latitude: number): number {
  const solarDeclination = -23.45
  const hourAngle = (hour - 12) * 15

  const latRad = (latitude * Math.PI) / 180
  const decRad = (solarDeclination * Math.PI) / 180
  const hourRad = (hourAngle * Math.PI) / 180

  const altitude = getSunAltitude(hour, latitude)
  const altRad = (altitude * Math.PI) / 180

  const cosAz = (Math.sin(decRad) - Math.sin(latRad) * Math.sin(altRad)) /
                (Math.cos(latRad) * Math.cos(altRad))

  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * (180 / Math.PI)

  // 오전은 동쪽(음수), 오후는 서쪽(양수)
  if (hour < 12) {
    azimuth = -azimuth
  }

  return azimuth // 남쪽 기준 각도
}

// 그림자 길이 계산
function getShadowLength(height: number, altitude: number): number {
  if (altitude <= 0) return 0
  return height / Math.tan((altitude * Math.PI) / 180)
}

export function ShadowDiagram({
  buildingWidth,
  buildingDepth,
  buildingHeight,
  latitude = 33.5 // 제주도 위도
}: ShadowDiagramProps) {

  // 시간대별 그림자 데이터 계산
  const shadowData = useMemo(() => {
    const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16]

    return hours.map(hour => {
      const altitude = getSunAltitude(hour, latitude)
      const azimuth = getSunAzimuth(hour, latitude)
      const shadowLength = getShadowLength(buildingHeight, altitude)

      return {
        hour,
        altitude: Math.max(0, altitude),
        azimuth,
        shadowLength: altitude > 0 ? shadowLength : 0,
        visible: altitude > 0
      }
    }).filter(d => d.visible)
  }, [buildingHeight, latitude])

  // SVG 좌표 계산을 위한 스케일
  const maxShadow = Math.max(...shadowData.map(d => d.shadowLength), buildingHeight * 2)
  const scale = 120 / maxShadow // SVG 좌표 스케일

  const buildingW = buildingWidth * scale
  const buildingD = buildingDepth * scale

  // SVG 중심점
  const cx = 150
  const cy = 150

  // 그림자 폴리곤 생성
  const getShadowPolygon = (azimuth: number, length: number) => {
    const shadowLen = length * scale
    const azRad = ((azimuth + 180) * Math.PI) / 180 // 태양 반대 방향

    // 건물 모서리 좌표 (북쪽이 위)
    const corners = [
      { x: -buildingW / 2, y: -buildingD / 2 }, // 북서
      { x: buildingW / 2, y: -buildingD / 2 },  // 북동
      { x: buildingW / 2, y: buildingD / 2 },   // 남동
      { x: -buildingW / 2, y: buildingD / 2 },  // 남서
    ]

    // 그림자 끝점 계산
    const shadowOffset = {
      x: Math.sin(azRad) * shadowLen,
      y: -Math.cos(azRad) * shadowLen // SVG Y축 반전
    }

    // 가장 먼 두 모서리 찾기
    const projections = corners.map((c, i) => ({
      index: i,
      corner: c,
      shadowEnd: { x: c.x + shadowOffset.x, y: c.y + shadowOffset.y },
      dist: Math.sqrt(
        Math.pow(c.x + shadowOffset.x, 2) +
        Math.pow(c.y + shadowOffset.y, 2)
      )
    }))

    // 그림자 방향에 따라 적절한 모서리 선택
    const sorted = [...projections].sort((a, b) => b.dist - a.dist)

    return `M ${cx + corners[0].x} ${cy + corners[0].y}
            L ${cx + corners[1].x} ${cy + corners[1].y}
            L ${cx + sorted[0].shadowEnd.x} ${cy + sorted[0].shadowEnd.y}
            L ${cx + sorted[1].shadowEnd.x} ${cy + sorted[1].shadowEnd.y}
            L ${cx + corners[3].x} ${cy + corners[3].y}
            Z`
  }

  // 시간별 색상
  const getTimeColor = (hour: number) => {
    const colors: Record<number, string> = {
      8: '#fef3c7',   // 연한 노랑
      9: '#fde68a',
      10: '#fcd34d',
      11: '#fbbf24',
      12: '#f59e0b',  // 정오 - 진한 주황
      13: '#f59e0b',
      14: '#fbbf24',
      15: '#fcd34d',
      16: '#fde68a',
    }
    return colors[hour] || '#fcd34d'
  }

  return (
    <div className="w-full">
      <svg viewBox="0 0 300 320" className="w-full h-auto">
        {/* 배경 */}
        <rect x="0" y="0" width="300" height="320" fill="#1f2937" rx="8" />

        {/* 방위 표시 */}
        <text x="150" y="20" textAnchor="middle" fill="#ef4444" fontSize="14" fontWeight="bold">N</text>
        <text x="280" y="155" textAnchor="middle" fill="#9ca3af" fontSize="12">E</text>
        <text x="150" y="295" textAnchor="middle" fill="#9ca3af" fontSize="12">S</text>
        <text x="20" y="155" textAnchor="middle" fill="#9ca3af" fontSize="12">W</text>

        {/* 방위선 */}
        <line x1="150" y1="30" x2="150" y2="270" stroke="#374151" strokeWidth="1" strokeDasharray="4,4" />
        <line x1="30" y1="150" x2="270" y2="150" stroke="#374151" strokeWidth="1" strokeDasharray="4,4" />

        {/* 동심원 (거리 표시) */}
        {[40, 80, 120].map((r, i) => (
          <g key={r}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#374151" strokeWidth="1" strokeDasharray="2,2" />
            <text x={cx + r + 5} y={cy - 3} fill="#6b7280" fontSize="8">
              {Math.round(r / scale)}m
            </text>
          </g>
        ))}

        {/* 그림자 영역 (시간순 역순으로 그려서 겹침 처리) */}
        {[...shadowData].reverse().map((data, i) => (
          <g key={data.hour}>
            {/* 그림자 영역 */}
            <path
              d={getShadowPolygon(data.azimuth, data.shadowLength)}
              fill={getTimeColor(data.hour)}
              fillOpacity={0.15}
              stroke={getTimeColor(data.hour)}
              strokeWidth="1"
              strokeOpacity={0.5}
            />

            {/* 시간 라벨 */}
            {data.shadowLength > 5 && (
              <text
                x={cx + Math.sin(((data.azimuth + 180) * Math.PI) / 180) * (data.shadowLength * scale * 0.7)}
                y={cy - Math.cos(((data.azimuth + 180) * Math.PI) / 180) * (data.shadowLength * scale * 0.7)}
                textAnchor="middle"
                fill={getTimeColor(data.hour)}
                fontSize="10"
                fontWeight="bold"
              >
                {data.hour}시
              </text>
            )}
          </g>
        ))}

        {/* 건물 */}
        <rect
          x={cx - buildingW / 2}
          y={cy - buildingD / 2}
          width={buildingW}
          height={buildingD}
          fill="#3b82f6"
          stroke="#60a5fa"
          strokeWidth="2"
        />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
          건물
        </text>

        {/* 범례 */}
        <g transform="translate(10, 300)">
          <text fill="#9ca3af" fontSize="9">동지(12/22) 기준 | 위도 {latitude.toFixed(1)}°N</text>
        </g>
      </svg>

      {/* 상세 정보 테이블 */}
      <div className="mt-3 bg-gray-800 rounded p-3">
        <div className="text-xs text-gray-400 mb-2">시간대별 그림자 길이</div>
        <div className="grid grid-cols-5 gap-1 text-xs">
          {shadowData.slice(0, 5).map(data => (
            <div key={data.hour} className="text-center">
              <div className="text-gray-300">{data.hour}시</div>
              <div className="text-yellow-400 font-medium">{data.shadowLength.toFixed(1)}m</div>
            </div>
          ))}
        </div>
        {shadowData.length > 5 && (
          <div className="grid grid-cols-5 gap-1 text-xs mt-1">
            {shadowData.slice(5).map(data => (
              <div key={data.hour} className="text-center">
                <div className="text-gray-300">{data.hour}시</div>
                <div className="text-yellow-400 font-medium">{data.shadowLength.toFixed(1)}m</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
