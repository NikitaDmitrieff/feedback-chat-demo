'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, ExternalLink, GitPullRequest, AlertCircle, Globe } from 'lucide-react'
import { StageBadge } from './stage-badge'
import type { PipelineRun, DeploymentInfo } from '@/lib/types'

const STAGE_ORDER = ['created', 'queued', 'running', 'validating', 'preview_ready', 'deployed']

type Props = {
  run: PipelineRun
  githubRepo: string
  projectId: string
  onClose: () => void
}

export function RunSlideOver({ run, githubRepo, projectId, onClose }: Props) {
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null)

  useEffect(() => {
    if (!run.github_pr_number) return
    fetch(`/api/runs/${projectId}/${run.id}/deployment`)
      .then((res) => res.json())
      .then(setDeployment)
      .catch(() => {})
  }, [run.id, run.github_pr_number, projectId])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const currentStageIndex = STAGE_ORDER.indexOf(run.stage)
  const isFailed = run.stage === 'failed' || run.stage === 'rejected'

  return (
    <>
      {/* Backdrop */}
      <div className="slide-over-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 flex h-screen w-full max-w-[480px] flex-col border-l border-edge bg-bg/95 backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-[family-name:var(--font-mono)] text-sm text-fg">
              #{run.github_issue_number}
            </span>
            <StageBadge stage={run.stage} />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Triggered by */}
          {run.triggered_by && (
            <p className="mb-5 text-xs text-muted">
              Triggered by <span className="text-fg">{run.triggered_by}</span>
            </p>
          )}

          {/* Stage timeline */}
          <div className="mb-6">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Timeline</h3>
            <div className="space-y-0">
              {STAGE_ORDER.map((stage, i) => {
                const isCompleted = i < currentStageIndex
                const isCurrent = stage === run.stage
                const isFutureOrFailed = !isCompleted && !isCurrent

                return (
                  <div key={stage} className="flex items-start gap-3">
                    {/* Dot + connector */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-2.5 w-2.5 rounded-full border-2 ${
                          isCompleted
                            ? 'border-success bg-success'
                            : isCurrent
                              ? isFailed
                                ? 'border-danger bg-danger'
                                : 'border-accent bg-accent'
                              : 'border-edge bg-transparent'
                        }`}
                      />
                      {i < STAGE_ORDER.length - 1 && (
                        <div
                          className={`h-6 w-0.5 ${
                            isCompleted ? 'bg-success/30' : 'bg-edge'
                          }`}
                        />
                      )}
                    </div>
                    {/* Label */}
                    <span
                      className={`-mt-0.5 text-xs ${
                        isCompleted || isCurrent ? 'text-fg' : 'text-dim'
                      }`}
                    >
                      {stage.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </div>
                )
              })}
              {/* Show failed/rejected as final step if applicable */}
              {isFailed && (
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2.5 w-2.5 rounded-full border-2 border-danger bg-danger" />
                  </div>
                  <span className="-mt-0.5 text-xs text-danger">
                    {run.stage === 'failed' ? 'Failed' : 'Rejected'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* PR link */}
          {run.github_pr_number && (
            <div className="mb-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Pull Request</h3>
              <a
                href={`https://github.com/${githubRepo}/pull/${run.github_pr_number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm text-accent transition-colors hover:bg-surface-hover"
              >
                <GitPullRequest className="h-4 w-4 shrink-0" />
                <span>#{run.github_pr_number}</span>
                <ExternalLink className="ml-auto h-3 w-3 text-muted" />
              </a>
            </div>
          )}

          {/* Deployment info */}
          {deployment?.previewUrl && (
            <div className="mb-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Deployment</h3>
              <a
                href={deployment.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm text-accent transition-colors hover:bg-surface-hover"
              >
                <Globe className="h-4 w-4 shrink-0" />
                <span className="truncate">{deployment.previewUrl.replace('https://', '')}</span>
                <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted" />
              </a>
              {deployment.description && (
                <p className="mt-1.5 text-[11px] text-muted">{deployment.description}</p>
              )}
            </div>
          )}

          {/* GitHub issue link */}
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Issue</h3>
            <a
              href={`https://github.com/${githubRepo}/issues/${run.github_issue_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm text-accent transition-colors hover:bg-surface-hover"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Issue #{run.github_issue_number}</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted" />
            </a>
          </div>

          {/* Timestamps */}
          <div className="mt-6 space-y-1.5 text-xs text-muted">
            <p>
              Started:{' '}
              <span className="tabular-nums text-fg">
                {new Date(run.started_at).toLocaleString()}
              </span>
            </p>
            {run.completed_at && (
              <p>
                Completed:{' '}
                <span className="tabular-nums text-fg">
                  {new Date(run.completed_at).toLocaleString()}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Footer — link to full detail page */}
        <div className="border-t border-edge px-6 py-4">
          <a
            href={`/projects/${projectId}/runs/${run.id}`}
            className="flex h-9 w-full items-center justify-center rounded-xl bg-surface text-sm font-medium text-fg transition-colors hover:bg-elevated"
          >
            View full details
          </a>
        </div>
      </div>
    </>
  )
}
