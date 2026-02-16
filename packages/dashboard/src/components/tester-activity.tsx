'use client'

import { Users } from 'lucide-react'
import type { TesterSummary } from '@/lib/types'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function TesterActivity({
  testers,
  onSelectTester,
}: {
  testers: TesterSummary[]
  onSelectTester: (testerId: string) => void
}) {
  const resolutionRate = (t: TesterSummary) =>
    t.total_count > 0 ? Math.round((t.resolved_count / t.total_count) * 100) : 0

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
      <p className="mb-4 text-sm text-muted">
        {testers.length} tester{testers.length !== 1 ? 's' : ''} active
      </p>

      <div className="space-y-2">
        {testers.map((tester) => {
          const rate = resolutionRate(tester)
          return (
            <button
              key={tester.tester_id}
              onClick={() => onSelectTester(tester.tester_id)}
              className="glass-card w-full p-4 text-left transition-colors hover:border-white/[0.08]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">
                    {tester.tester_name || 'Anonymous'}
                  </p>

                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                    <span>{tester.session_count} conversation{tester.session_count !== 1 ? 's' : ''}</span>
                    <span className="text-white/10">&middot;</span>
                    <span>{timeAgo(tester.last_active)}</span>
                    {tester.top_themes.length > 0 && (
                      <>
                        <span className="text-white/10">&middot;</span>
                        <div className="flex gap-1">
                          {tester.top_themes.slice(0, 3).map((theme) => (
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

                  {/* Resolution rate bar */}
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
