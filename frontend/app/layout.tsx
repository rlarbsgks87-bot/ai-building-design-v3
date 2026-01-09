import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI 건축 기획설계 서비스',
  description: '제주도 특화 AI 건축 기획설계 서비스',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
