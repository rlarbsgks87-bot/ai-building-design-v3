'use client'

import { useEffect, useState, ReactNode } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'
const HEALTH_ENDPOINT = API_URL.replace('/api/v1', '/health/')

type ServerStatus = 'checking' | 'waking' | 'ready' | 'error'

interface ServerWakeUpProps {
  children: ReactNode
}

export function ServerWakeUp({ children }: ServerWakeUpProps) {
  const [status, setStatus] = useState<ServerStatus>('checking')
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 10

  useEffect(() => {
    const checkServer = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(HEALTH_ENDPOINT, {
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          setStatus('ready')
          return
        }
        throw new Error('Server not ready')
      } catch (error) {
        if (retryCount === 0) {
          setStatus('waking')
        }

        if (retryCount < maxRetries) {
          setTimeout(() => {
            setRetryCount((prev) => prev + 1)
          }, 3000)
        } else {
          setStatus('error')
        }
      }
    }

    if (status !== 'ready' && status !== 'error') {
      checkServer()
    }
  }, [retryCount, status])

  if (status === 'checking') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">서버 상태 확인 중...</p>
        </div>
      </div>
    )
  }

  if (status === 'waking') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-blue-50 to-white z-50">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-6 animate-pulse-slow">&#9749;</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            서버를 깨우는 중...
          </h2>
          <p className="text-gray-600 mb-4">
            무료 서버는 비활성 시 슬립 모드로 전환됩니다.
            <br />
            최대 30초 정도 소요될 수 있습니다.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span>재시도 중... ({retryCount}/{maxRetries})</span>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-red-50 to-white z-50">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-6">&#128533;</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            서버 연결 실패
          </h2>
          <p className="text-gray-600 mb-6">
            서버에 연결할 수 없습니다.
            <br />
            잠시 후 다시 시도해 주세요.
          </p>
          <button
            onClick={() => {
              setStatus('checking')
              setRetryCount(0)
            }}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
