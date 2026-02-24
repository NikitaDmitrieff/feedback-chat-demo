import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { SidebarWrapper } from '@/components/sidebar-wrapper'
import { MainContent } from '@/components/main-content'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'feedback.chat — AI Feedback Intelligence',
  description: 'Turn user feedback into shipped features automatically. AI refines ideas into GitHub issues, your agent implements them, you approve the PR.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
  },
  openGraph: {
    title: 'feedback.chat — AI Feedback Intelligence',
    description: 'Turn user feedback into shipped features automatically.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'feedback.chat',
    description: 'Turn user feedback into shipped features automatically.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen font-[family-name:var(--font-inter)] antialiased">
        <SidebarWrapper />
        <MainContent>{children}</MainContent>
      </body>
    </html>
  )
}
