'use client'

import { useState } from 'react'
import { massApi, MassResult } from '@/lib/api'
import { useAppStore } from '@/lib/store'

interface MassFormProps {
  pnu: string
  onResult: (result: MassResult) => void
}

export function MassForm({ pnu, onResult }: MassFormProps) {
  const { setIsLoading, setError } = useAppStore()
  const [buildingType, setBuildingType] = useState('apartment')
  const [targetFloors, setTargetFloors] = useState(5)
  const [setbacks, setSetbacks] = useState({
    front: 3,
    back: 2,
    left: 1.5,
    right: 1.5,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setApiError(null)
    setIsLoading(true)

    try {
      const response = await massApi.calculate({
        pnu,
        building_type: buildingType,
        target_floors: targetFloors,
        setbacks,
      })

      if (response.success) {
        onResult(response.data)
      } else {
        setApiError('매스 계산에 실패했습니다.')
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setApiError('일일 매스 계산 한도를 초과했습니다.')
      } else {
        setApiError(err.response?.data?.message || '오류가 발생했습니다.')
      }
      setError(err.message)
    } finally {
      setIsSubmitting(false)
      setIsLoading(false)
    }
  }

  const buildingTypes = [
    { value: 'apartment', label: '아파트' },
    { value: 'officetel', label: '오피스텔' },
    { value: 'multi_family', label: '다세대주택' },
    { value: 'neighborhood', label: '근린생활시설' },
    { value: 'office', label: '업무시설' },
  ]

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-bold text-gray-900 mb-4">매스 계산</h3>

      <div className="space-y-4">
        {/* 건물 유형 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            건물 유형
          </label>
          <select
            value={buildingType}
            onChange={(e) => setBuildingType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {buildingTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* 목표 층수 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            목표 층수
          </label>
          <input
            type="number"
            value={targetFloors}
            onChange={(e) => setTargetFloors(parseInt(e.target.value) || 1)}
            min={1}
            max={50}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 이격거리 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            이격거리 (m)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">전면</label>
              <input
                type="number"
                value={setbacks.front}
                onChange={(e) =>
                  setSetbacks({ ...setbacks, front: parseFloat(e.target.value) || 0 })
                }
                step={0.5}
                min={0}
                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">후면</label>
              <input
                type="number"
                value={setbacks.back}
                onChange={(e) =>
                  setSetbacks({ ...setbacks, back: parseFloat(e.target.value) || 0 })
                }
                step={0.5}
                min={0}
                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">좌측</label>
              <input
                type="number"
                value={setbacks.left}
                onChange={(e) =>
                  setSetbacks({ ...setbacks, left: parseFloat(e.target.value) || 0 })
                }
                step={0.5}
                min={0}
                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">우측</label>
              <input
                type="number"
                value={setbacks.right}
                onChange={(e) =>
                  setSetbacks({ ...setbacks, right: parseFloat(e.target.value) || 0 })
                }
                step={0.5}
                min={0}
                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {apiError && (
          <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{apiError}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
        >
          {isSubmitting ? '계산 중...' : '매스 계산'}
        </button>
      </div>
    </form>
  )
}
