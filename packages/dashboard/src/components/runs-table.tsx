'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { StageBadge } from './stage-badge'
import { RunSlideOver } from './run-slide-over'
import type { PipelineRun } from '@/lib/types'

type Props = {
  runs: PipelineRun[]
  githubRepo: string
  projectId: string
}

export function RunsTable({ runs, githubRepo, projectId }: Props) {
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null)

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
              <th className="px-5 py-3 font-medium">Triggered by</th>
              <th className="px-5 py-3 font-medium">Stage</th>
              <th className="px-5 py-3 font-medium">Result</th>
              <th className="px-5 py-3 font-medium">PR</th>
              <th className="px-5 py-3 font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                onClick={() => setSelectedRun(run)}
                className="cursor-pointer border-b border-edge/50 transition-colors last:border-0 hover:bg-surface-hover"
              >
                <td className="px-5 py-3 font-[family-name:var(--font-mono)] text-xs text-fg">
                  #{run.github_issue_number}
                </td>
                <td className="px-5 py-3 text-xs text-muted">
                  {run.triggered_by ?? <span className="text-dim">&mdash;</span>}
                </td>
                <td className="px-5 py-3">
                  <StageBadge stage={run.stage} />
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
                  {new Date(run.started_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
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
