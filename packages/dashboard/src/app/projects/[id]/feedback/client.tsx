'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { DigestCard } from '@/components/digest-card'
import { FeedbackList } from '@/components/feedback-list'
import { FeedbackSlideOver } from '@/components/feedback-slide-over'
import { TesterActivity } from '@/components/tester-activity'
import type { FeedbackSession, FeedbackTheme, TesterSummary } from '@/lib/types'

const THEME_COLORS = ['#5e9eff', '#f59e0b', '#10b981', '#8b5cf6', '#f43f5e', '#06b6d4']

function ThemeChart({ themes }: { themes: FeedbackTheme[] }) {
  const total = themes.reduce((s, t) => s + t.message_count, 0)
  if (total === 0) return null

  return (
    <div className="glass-card p-4 mb-6">
      <p className="text-xs font-medium text-muted mb-3 uppercase tracking-wider">Theme Distribution</p>
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {themes.map((t, i) => (
          <div
            key={t.id}
            style={{ width: `${(t.message_count / total) * 100}%`, backgroundColor: THEME_COLORS[i % THEME_COLORS.length] }}
            title={`${t.name}: ${t.message_count} messages`}
            className="hover:opacity-80 transition-opacity"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-3">
        {themes.map((t, i) => (
          <div key={t.id} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: THEME_COLORS[i % THEME_COLORS.length] }} />
            <span className="text-[11px] text-muted">{t.name} ({t.message_count})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

type Props = {
  projectId: string
  githubRepo: string | null
  themes: FeedbackTheme[]
}

export function FeedbackPageClient({ projectId, githubRepo, themes }: Props) {
  const [tab, setTab] = useState<'feedback' | 'testers'>('feedback')
  const [selectedSession, setSelectedSession] = useState<FeedbackSession | null>(null)
  const [testers, setTesters] = useState<TesterSummary[]>([])
  const [testersLoading, setTestersLoading] = useState(false)

  const fetchTesters = useCallback(async () => {
    setTestersLoading(true)
    try {
      const res = await fetch(`/api/feedback/${projectId}/testers`)
      if (res.ok) {
        const json = await res.json()
        setTesters(json.testers ?? [])
      }
    } finally {
      setTestersLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (tab === 'testers') fetchTesters()
  }, [tab, fetchTesters])

  const handleStatusChange = useCallback((sessionId: string, status: FeedbackSession['status']) => {
    if (selectedSession?.id === sessionId) {
      setSelectedSession((prev) => prev ? { ...prev, status } : null)
    }
  }, [selectedSession?.id])

  return (
    <>
      <DigestCard projectId={projectId} />

      {themes.length > 0 && <ThemeChart themes={themes} />}

      <div className="mb-6 mt-6 flex items-center gap-1 rounded-lg bg-white/[0.04] p-1">
        <button
          onClick={() => setTab('feedback')}
          className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
            tab === 'feedback' ? 'bg-white/[0.08] text-fg' : 'text-muted hover:text-fg'
          }`}
        >
          Conversations
        </button>
        <button
          onClick={() => setTab('testers')}
          className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
            tab === 'testers' ? 'bg-white/[0.08] text-fg' : 'text-muted hover:text-fg'
          }`}
        >
          Testers
        </button>
      </div>

      {tab === 'feedback' ? (
        <FeedbackList
          projectId={projectId}
          themes={themes}
          onSelectSession={setSelectedSession}
        />
      ) : testersLoading ? (
        <div className="flex items-center justify-center py-12 text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <TesterActivity testers={testers} />
      )}

      {selectedSession && (
        <FeedbackSlideOver
          session={selectedSession}
          themes={themes}
          projectId={projectId}
          githubRepo={githubRepo}
          onClose={() => setSelectedSession(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </>
  )
}
