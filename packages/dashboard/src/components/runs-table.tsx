'use client'

import { useState, useEffect } from 'react'
import { ExternalLink, MessageCircle } from 'lucide-react'
import { StageBadge } from './stage-badge'
import { RunSlideOver } from './run-slide-over'
import type { EnrichedPipelineRun } from '@/lib/types'

const ACTIVE_STAGES = new Set(['running', 'validating', 'queued'])

function elapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{elapsed(startedAt)}</>
}

type Props = {
  runs: EnrichedPipelineRun[]
  githubRepo: string
  projectId: string
}

export function RunsTable({ runs, githubRepo, projectId }: Props) {
  const [selectedRun, setSelectedRun] = useState<EnrichedPipelineRun | null>(null)

  if (runs.length === 0) {
    return (
      <div className="glass-card px-5 py-10 text-center">
        <p className="text-sm text-muted">
          Runs will appear here once you complete setup and send your first feedback.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="glass-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-edge text-xs text-muted">
              <th className="px-5 py-3 font-medium">Issue</th>
              <th className="px-5 py-3 font-medium">Source</th>
              <th className="px-5 py-3 font-medium">Stage</th>
              <th className="px-5 py-3 font-medium">Result</th>
              <th className="px-5 py-3 font-medium">PR</th>
              <th className="px-5 py-3 font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const isActive = !run.result && ACTIVE_STAGES.has(run.stage)
              return (
                <tr
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className="cursor-pointer border-b border-edge/50 transition-colors last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-5 py-3 font-[family-name:var(--font-mono)] text-xs text-fg">
                    #{run.github_issue_number}
                  </td>
                  <td className="max-w-[200px] px-5 py-3">
                    {run.feedback_source ? (
                      <div className="flex items-center gap-1.5">
                        <MessageCircle className="h-3 w-3 shrink-0 text-accent" />
                        <span className="truncate text-xs text-fg">
                          {run.feedback_source.tester_name || 'Anonymous'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-dim">Manual</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {isActive && run.stage !== 'running' && (
                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                        </span>
                      )}
                      <StageBadge stage={run.stage} />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted">
                    {run.result ?? <span className="text-dim">&mdash;</span>}
                  </td>
                  <td className="px-5 py-3">
                    {run.github_pr_number ? (
                      <a
                        href={`https://github.com/${githubRepo}/pull/${run.github_pr_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-accent transition-colors hover:text-accent/80"
                      >
                        #{run.github_pr_number}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-dim">&mdash;</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted tabular-nums">
                    {isActive ? (
                      <ElapsedTimer startedAt={run.started_at} />
                    ) : (
                      new Date(run.started_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedRun && (
        <RunSlideOver
          run={selectedRun}
          githubRepo={githubRepo}
          projectId={projectId}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </>
  )
}
