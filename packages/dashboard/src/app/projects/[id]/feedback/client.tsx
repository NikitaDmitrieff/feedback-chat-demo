'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { DigestCard } from '@/components/digest-card'
import { FeedbackList } from '@/components/feedback-list'
import { FeedbackSlideOver } from '@/components/feedback-slide-over'
import { TesterActivity } from '@/components/tester-activity'
import type { FeedbackSession, FeedbackTheme, TesterSummary } from '@/lib/types'

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
