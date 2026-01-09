'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { massApi, MassGeometry } from '@/lib/api'
import { MassInfo } from '@/components/Mass/MassInfo'

// Three.js는 클라이언트에서만 로드
const MassViewer = dynamic(
  () => import('@/components/Mass/MassViewer').then((mod) => mod.MassViewer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">3D 뷰어 로딩 중...</p>
        </div>
      </div>
    ),
  }
)

function ViewerPageContent() {
  const searchParams = useSearchParams()
  const massId = searchParams.get('mass_id')

  const [geometry, setGeometry] = useState<MassGeometry | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (massId) {
      loadGeometry(massId)
    }
  }, [massId])

  const loadGeometry = async (id: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await massApi.getGeometry(id)
      if (response.success) {
        setGeometry(response.data)
      } else {
        setError('지오메트리 데이터를 불러올 수 없습니다.')
      }
    } catch (err) {
      setError('데이터 로딩 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  // 데모용 샘플 지오메트리
  const loadSampleGeometry = () => {
    setGeometry({
      type: 'box',
      format: 'three.js',
      dimensions: {
        width: 15,
        height: 15,
        depth: 20,
      },
      position: {
        x: 0,
        y: 7.5,
        z: 0,
      },
      land: {
        latitude: 33.4996,
        longitude: 126.5312,
      },
    })
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-white">
            AI 건축 기획설계
          </Link>
          <nav className="flex gap-4">
            <Link href="/search" className="text-gray-300 hover:text-white">
              토지 검색
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-56px)]">
        {/* 3D Viewer */}
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-800">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-400">매스 데이터 로딩 중...</p>
              </div>
            </div>
          ) : error ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-800">
              <div className="text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={loadSampleGeometry}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  샘플 매스 보기
                </button>
              </div>
            </div>
          ) : (
            <MassViewer geometry={geometry} />
          )}

          {/* 안내 메시지 */}
          {!geometry && !isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <div className="text-center">
                <p className="text-6xl mb-6">&#127970;</p>
                <h2 className="text-2xl font-bold text-white mb-2">3D 매스 뷰어</h2>
                <p className="text-gray-400 mb-6">
                  토지 검색에서 매스를 계산하면 여기서 3D로 확인할 수 있습니다.
                </p>
                <div className="flex gap-4 justify-center">
                  <Link
                    href="/search"
                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    토지 검색하기
                  </Link>
                  <button
                    onClick={loadSampleGeometry}
                    className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                  >
                    샘플 매스 보기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        {geometry && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto">
            <div className="p-4">
              <MassInfo geometry={geometry} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      }
    >
      <ViewerPageContent />
    </Suspense>
  )
}
