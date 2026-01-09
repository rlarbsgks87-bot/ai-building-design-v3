'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { landApi, SearchResult } from '@/lib/api'
import { useAppStore } from '@/lib/store'

interface SearchBoxProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchBox({ value, onChange, placeholder }: SearchBoxProps) {
  const router = useRouter()
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setMapCenter } = useAppStore()

  const handleSearch = useCallback(async () => {
    if (!value.trim() || value.length < 2) {
      setResults([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await landApi.search(value)
      if (response.success) {
        setResults(response.data)
        setIsOpen(true)
      } else {
        setError('검색 결과가 없습니다.')
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError('일일 검색 한도를 초과했습니다.')
      } else {
        setError('검색 중 오류가 발생했습니다.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleSelect = (result: SearchResult) => {
    setMapCenter({ lat: result.y, lng: result.x })
    setIsOpen(false)
    onChange(result.address)
    router.push(`/search?lat=${result.y}&lng=${result.x}`)
  }

  useEffect(() => {
    const handleClickOutside = () => setIsOpen(false)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
        >
          {isLoading ? '...' : '검색'}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}

      {isOpen && results.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
          {results.map((result, index) => (
            <li
              key={index}
              onClick={() => handleSelect(result)}
              className="px-4 py-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
            >
              <p className="font-medium text-gray-900">{result.title}</p>
              <p className="text-sm text-gray-600">{result.address}</p>
              {result.road_address && (
                <p className="text-sm text-gray-500">{result.road_address}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
