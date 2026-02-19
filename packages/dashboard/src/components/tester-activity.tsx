'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Users, ArrowUpDown, Zap } from 'lucide-react'
import { timeAgo } from '@/lib/format'
import type { TesterSummary } from '@/lib/types'

type SortKey = 'last_active' | 'session_count' | 'runs_triggered'

function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360

  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: `hsl(${hue}, 50%, 40%)` }}
    >
      {initials}
    </div>
  )
}

export function TesterActivity({ testers }: { testers: TesterSummary[] }) {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const [sortBy, setSortBy] = useState<SortKey>('last_active')

  const resolutionRate = (t: TesterSummary) =>
    t.session_count > 0 ? Math.round((t.resolved_count / t.session_count) * 100) : 0

  const sorted = [...testers].sort((a, b) => {
    switch (sortBy) {
      case 'session_count':
        return b.session_count - a.session_count
      case 'runs_triggered':
        return (b.runs_triggered ?? 0) - (a.runs_triggered ?? 0)
      case 'last_active':
      default:
        return new Date(b.last_active).getTime() - new Date(a.last_active).getTime()
    }
  })

  if (testers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted">
        <Users className="h-8 w-8" />
        <p className="text-sm">No testers yet</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {testers.length} tester{testers.length !== 1 ? 's' : ''} active
        </p>
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5">
          <ArrowUpDown className="ml-2 h-3 w-3 text-muted" />
          {(['last_active', 'session_count', 'runs_triggered'] as const).map(key => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                sortBy === key ? 'bg-white/[0.08] text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {key === 'last_active' ? 'Recent' : key === 'session_count' ? 'Sessions' : 'Runs'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((tester) => {
          const rate = resolutionRate(tester)
          const name = tester.tester_name || 'Anonymous'
          return (
            <button
              key={tester.tester_id}
              onClick={() => router.push(`/projects/${projectId}/testers/${encodeURIComponent(tester.tester_id)}`)}
              className="glass-card w-full p-4 text-left transition-colors hover:border-white/[0.08]"
            >
              <div className="flex items-start gap-3">
                <InitialsAvatar name={name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{name}</p>

                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                    <span>{tester.session_count} conversation{tester.session_count !== 1 ? 's' : ''}</span>
                    <span className="text-white/10">&middot;</span>
                    <span>{timeAgo(tester.last_active)}</span>
                    {(tester.runs_triggered ?? 0) > 0 && (
                      <>
                        <span className="text-white/10">&middot;</span>
                        <span className="flex items-center gap-0.5">
                          <Zap className="h-2.5 w-2.5 text-amber-400" />
                          {tester.runs_triggered} run{tester.runs_triggered !== 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                    {tester.top_themes.length > 0 && (
                      <>
                        <span className="text-white/10">&middot;</span>
                        <div className="flex gap-1">
                          {tester.top_themes.map((theme) => (
                            <span
                              key={theme.name}
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: `${theme.color}20`,
                                color: theme.color,
                              }}
                            >
                              {theme.name}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-success transition-all duration-500"
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted">
                      {rate}% resolved
                    </span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
