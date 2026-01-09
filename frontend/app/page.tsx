'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'

// 3D Preview를 동적으로 로드
const Preview3D = dynamic(
  () => import('@/components/Design/Preview3D').then((mod) => mod.Preview3D),
  { ssr: false, loading: () => <PreviewLoading /> }
)

function PreviewLoading() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse">
          <div className="w-48 h-48 bg-gray-700 rounded-lg mx-auto mb-4"></div>
          <div className="h-4 w-32 bg-gray-700 rounded mx-auto"></div>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    setIsSearching(true)
    // 검색 페이지로 이동하면서 쿼리 전달
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
  }

  const handleSampleClick = (type: 'commercial' | 'residential') => {
    if (type === 'commercial') {
      router.push('/design?pnu=5011010300112580001&address=제주시 이도일동 1258-1&type=commercial')
    } else {
      router.push('/design?pnu=5011010100103960001&address=제주시 연동 396&type=residential')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <span className="text-lg font-bold text-gray-900">건축설계</span>
            </Link>
            <span className="px-2 py-0.5 text-xs text-gray-500 bg-gray-100 rounded-full">
              Ver. 1.0.0
            </span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/search" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
              토지검색
            </Link>
            <Link href="/design" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
              나의 설계내역
            </Link>
            <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-full hover:bg-gray-200 transition">
              로그인
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="pt-20">
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-6">
                지금부터 완전히<br />
                새로운 건축설계를<br />
                경험해 보실 수 있어요.
              </h1>

              {/* Search Box */}
              <form onSubmit={handleSearch} className="mb-4">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="지번 or 도로명으로 검색"
                    className="w-full px-6 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none pr-28 transition"
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
                  >
                    {isSearching ? '검색중...' : '검색'}
                  </button>
                </div>
              </form>

              <p className="text-gray-500 text-sm mb-8">
                실시간으로 최대 10개의 설계안을 만들어보세요.
              </p>

              {/* Quick Examples */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSearchQuery('제주시 연동')}
                  className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition"
                >
                  제주시 연동
                </button>
                <button
                  onClick={() => setSearchQuery('제주시 이도동')}
                  className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition"
                >
                  제주시 이도동
                </button>
                <button
                  onClick={() => setSearchQuery('서귀포시 중앙동')}
                  className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition"
                >
                  서귀포시 중앙동
                </button>
              </div>
            </div>

            {/* Right Content - 3D Preview */}
            <div className="relative">
              <div className="aspect-[4/3] relative rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-gray-800 to-gray-900">
                {/* Decorative UI Elements */}
                <div className="absolute top-4 left-4 z-10">
                  <div className="bg-white/10 backdrop-blur rounded-lg p-3 text-white">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center text-xs font-bold">AI</div>
                      <span className="text-sm font-medium">건축설계</span>
                    </div>
                    <div className="text-xs text-gray-300">경기도 남양주시 다산동 6064</div>
                  </div>
                </div>

                {/* Floating Info Cards */}
                <div className="absolute top-4 right-4 z-10 space-y-2">
                  <div className="bg-white rounded-lg shadow-lg p-2 text-xs w-32">
                    <div className="flex items-center gap-1 text-blue-600 font-medium mb-1">
                      <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                      업무시설
                    </div>
                    <div className="text-gray-500">용적률: 897.74%</div>
                    <div className="text-gray-500">건폐율: 59%</div>
                  </div>
                  <div className="bg-white rounded-lg shadow-lg p-2 text-xs w-32">
                    <div className="flex items-center gap-1 text-green-600 font-medium mb-1">
                      <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                      근린생활
                    </div>
                    <div className="text-gray-500">연면적: 1,580.3m²</div>
                  </div>
                </div>

                {/* 3D Building Preview */}
                <Preview3D />

                {/* Bottom Bar */}
                <div className="absolute bottom-4 left-4 right-4 z-10">
                  <div className="bg-white/10 backdrop-blur rounded-lg p-2 flex items-center justify-between">
                    <div className="flex gap-1">
                      <button className="px-3 py-1 bg-blue-600 text-white text-xs rounded">CAD파일 다운</button>
                      <button className="px-3 py-1 bg-gray-600 text-white text-xs rounded">설계보고서</button>
                    </div>
                    <span className="text-xs text-gray-400">Powered by AI</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="bg-gray-900 py-20">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-white text-center mb-4">
              도면부터 CAD파일까지 한번에 확인하세요.
            </h2>
            <p className="text-gray-400 text-center mb-12">
              AI가 최적의 건축 설계안을 실시간으로 생성합니다.
            </p>

            <div className="flex justify-center gap-4">
              <button
                onClick={() => handleSampleClick('commercial')}
                className="px-8 py-4 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition flex items-center gap-2"
              >
                상업지역 샘플
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button
                onClick={() => handleSampleClick('residential')}
                className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition flex items-center gap-2"
              >
                주거지역 샘플
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* Popular Areas - 인기 지역 */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
              인기 지역
            </h2>
            <p className="text-gray-500 text-center mb-12">
              제주도에서 가장 인기있는 토지를 살펴보세요
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* 연동 */}
              <button
                onClick={() => router.push('/search?q=제주시 연동&lat=33.4890&lng=126.4983')}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 p-6 text-left transition-transform hover:scale-[1.02] hover:shadow-xl"
              >
                <div className="relative z-10">
                  <div className="text-blue-200 text-sm mb-2">제주시</div>
                  <h3 className="text-2xl font-bold text-white mb-2">연동</h3>
                  <p className="text-blue-100 text-sm mb-4">
                    제주 최대 상권<br />
                    신제주 중심지
                  </p>
                  <div className="flex items-center gap-4 text-xs text-blue-200">
                    <span className="px-2 py-1 bg-white/20 rounded-full">상업지역</span>
                    <span className="px-2 py-1 bg-white/20 rounded-full">높은 유동인구</span>
                  </div>
                </div>
                <div className="absolute right-4 bottom-4 text-6xl opacity-20 group-hover:opacity-30 transition-opacity">
                  🏪
                </div>
              </button>

              {/* 노형동 */}
              <button
                onClick={() => router.push('/search?q=제주시 노형동&lat=33.4756&lng=126.4762')}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-500 to-green-700 p-6 text-left transition-transform hover:scale-[1.02] hover:shadow-xl"
              >
                <div className="relative z-10">
                  <div className="text-green-200 text-sm mb-2">제주시</div>
                  <h3 className="text-2xl font-bold text-white mb-2">노형동</h3>
                  <p className="text-green-100 text-sm mb-4">
                    신흥 주거지역<br />
                    젊은층 선호
                  </p>
                  <div className="flex items-center gap-4 text-xs text-green-200">
                    <span className="px-2 py-1 bg-white/20 rounded-full">주거지역</span>
                    <span className="px-2 py-1 bg-white/20 rounded-full">개발호재</span>
                  </div>
                </div>
                <div className="absolute right-4 bottom-4 text-6xl opacity-20 group-hover:opacity-30 transition-opacity">
                  🏠
                </div>
              </button>

              {/* 이도동 */}
              <button
                onClick={() => router.push('/search?q=제주시 이도동&lat=33.5003&lng=126.5311')}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 p-6 text-left transition-transform hover:scale-[1.02] hover:shadow-xl"
              >
                <div className="relative z-10">
                  <div className="text-purple-200 text-sm mb-2">제주시</div>
                  <h3 className="text-2xl font-bold text-white mb-2">이도동</h3>
                  <p className="text-purple-100 text-sm mb-4">
                    제주 구도심<br />
                    행정·교육 중심
                  </p>
                  <div className="flex items-center gap-4 text-xs text-purple-200">
                    <span className="px-2 py-1 bg-white/20 rounded-full">복합용도</span>
                    <span className="px-2 py-1 bg-white/20 rounded-full">교통 편리</span>
                  </div>
                </div>
                <div className="absolute right-4 bottom-4 text-6xl opacity-20 group-hover:opacity-30 transition-opacity">
                  🏢
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
              이렇게 사용하세요
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">1. 토지 검색</h3>
                <p className="text-gray-600">
                  지번 또는 도로명 주소로<br />
                  원하는 토지를 검색합니다.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">2. 법규 검토</h3>
                <p className="text-gray-600">
                  건폐율, 용적률, 이격거리 등<br />
                  건축 법규를 자동 계산합니다.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">3. 3D 설계</h3>
                <p className="text-gray-600">
                  AI가 최적의 건물 배치를<br />
                  3D로 시각화합니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="bg-white py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <div className="text-4xl font-bold text-blue-600 mb-1">10+</div>
                <div className="text-gray-600">설계 대안 생성</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-blue-600 mb-1">3D</div>
                <div className="text-gray-600">실시간 시각화</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-blue-600 mb-1">AI</div>
                <div className="text-gray-600">자동 최적화</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-blue-600 mb-1">제주</div>
                <div className="text-gray-600">특화 서비스</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <span className="text-lg font-bold text-white">건축설계</span>
            </div>
            <div className="text-gray-500 text-sm">
              AI 건축 기획설계 서비스 v1.0.0
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
