'use client'

import { useEffect, useState } from 'react'
import { Check, Edit3, Loader2, X, ExternalLink, GitBranch, ArrowRight, Sparkles, User } from 'lucide-react'
import type { Proposal, PipelineRun } from '@/lib/types'
import { LiveLogTail } from './live-log-tail'
import { DeploymentPreview } from './deployment-preview'

type Props = {
  proposal: Proposal
  projectId: string
  githubRepo: string | null
  onClose: () => void
  onUpdate: (updated: Proposal) => void
  /** If the proposal has an active pipeline run, pass its ID for live log tailing */
  activeRunId?: string | null
}

const PRIORITY_LABEL: Record<string, { label: string; color: string }> = {
  high: { label: 'High', color: 'text-red-400 bg-red-400/10 border border-red-400/20' },
  medium: { label: 'Medium', color: 'text-amber-400 bg-amber-400/10 border border-amber-400/20' },
  low: { label: 'Low', color: 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20' },
}

const SCORE_LABELS = [
  { key: 'impact' as const, label: 'Impact' },
  { key: 'feasibility' as const, label: 'Feasibility' },
  { key: 'novelty' as const, label: 'Novelty' },
  { key: 'alignment' as const, label: 'Alignment' },
]

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export function ProposalSlideOver({ proposal, projectId, githubRepo, onClose, onUpdate, activeRunId }: Props) {
  const [editing, setEditing] = useState(false)
  const [editedSpec, setEditedSpec] = useState(proposal.spec)
  const [userNotes, setUserNotes] = useState(proposal.user_notes || '')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [loading, setLoading] = useState(false)
  const [approveSuccess, setApproveSuccess] = useState(false)
  const [branchName, setBranchName] = useState(
    proposal.branch_name || `proposals/${slugify(proposal.title)}`
  )
  const [relatedRun, setRelatedRun] = useState<PipelineRun | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Auto-close after success animation completes
  useEffect(() => {
    if (!approveSuccess) return
    const timer = setTimeout(() => onClose(), 800)
    return () => clearTimeout(timer)
  }, [approveSuccess, onClose])

  // Fetch related pipeline run for proposals that have a GitHub issue
  useEffect(() => {
    if (!proposal.github_issue_number || proposal.status === 'draft') return
    fetch(`/api/runs/${projectId}`)
      .then(res => res.json())
      .then(data => {
        const runs: PipelineRun[] = data.runs ?? data ?? []
        const match = runs.find(r => r.github_issue_number === proposal.github_issue_number)
        if (match) setRelatedRun(match)
      })
      .catch(() => {})
  }, [projectId, proposal.github_issue_number, proposal.status])

  async function handleAction(action: 'approve' | 'reject') {
    setLoading(true)
    try {
      const res = await fetch(`/api/proposals/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          action,
          userNotes: action === 'approve' ? userNotes || undefined : undefined,
          modifiedSpec: action === 'approve' && editing ? editedSpec : undefined,
          branchName: action === 'approve' ? branchName || undefined : undefined,
          rejectReason: action === 'reject' ? rejectReason || undefined : undefined,
        }),
      })

      if (res.ok) {
        const json = await res.json()
        onUpdate({
          ...proposal,
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewed_at: new Date().toISOString(),
          spec: editing ? editedSpec : proposal.spec,
          user_notes: userNotes || null,
          reject_reason: action === 'reject' ? rejectReason || null : null,
          github_issue_number: json.github_issue_number ?? proposal.github_issue_number,
        })
        if (action === 'approve') {
          setApproveSuccess(true)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const priority = PRIORITY_LABEL[proposal.priority] ?? PRIORITY_LABEL.medium
  const hasScores = proposal.scores && Object.keys(proposal.scores).length > 0
  const isUserSubmitted = !hasScores

  return (
    <>
      <div className="slide-over-backdrop" onClick={onClose} />

      <div className="fixed top-0 right-0 z-50 flex h-screen w-full max-w-[480px] flex-col border-l border-edge bg-bg/95 backdrop-blur-xl overflow-hidden">
        {/* Success overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 transition-opacity duration-300"
          style={{ opacity: approveSuccess ? 1 : 0 }}
        >
          <div className="absolute inset-0 bg-emerald-500/8 backdrop-blur-sm" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-400/50 shadow-[0_0_40px_rgba(34,197,94,0.25)]">
            <Check className="h-9 w-9 text-emerald-400" strokeWidth={2.5} />
          </div>
          <div className="relative text-center">
            <p className="text-sm font-semibold text-emerald-400">Approved</p>
            <p className="mt-0.5 text-xs text-emerald-400/60">Sending to agent...</p>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-6 py-4">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${priority.color}`}>
              {priority.label}
            </span>
            {isUserSubmitted ? (
              <span className="flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-400">
                <User className="h-3 w-3" />
                You
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                <Sparkles className="h-3 w-3" />
                AI
              </span>
            )}
            <span className="text-xs text-muted">{proposal.status}</span>
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
          <h2 className="mb-4 text-base font-medium text-fg">{proposal.title}</h2>

          {/* Score grid (AI proposals only) */}
          {hasScores && (
            <div className="mb-5 grid grid-cols-4 gap-2">
              {SCORE_LABELS.map(({ key, label }) => {
                const val = proposal.scores[key]
                return (
                  <div key={key} className="rounded-lg bg-surface p-2 text-center">
                    <div className="text-lg font-semibold tabular-nums text-fg">
                      {val != null ? Math.round(val * 100) : '—'}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Rationale */}
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
              Rationale
            </h3>
            <p className="text-sm leading-relaxed text-fg">{proposal.rationale}</p>
          </div>

          {/* Spec */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Spec</h3>
              {proposal.status === 'draft' && (
                <button
                  onClick={() => setEditing(!editing)}
                  className="flex items-center gap-1 text-[11px] text-accent transition-colors hover:text-fg"
                >
                  <Edit3 className="h-3 w-3" />
                  {editing ? 'Preview' : 'Edit'}
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                value={editedSpec}
                onChange={e => setEditedSpec(e.target.value)}
                className="h-48 w-full rounded-lg bg-surface p-3 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            ) : (
              <div className="rounded-lg bg-surface p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                  {editing ? editedSpec : proposal.spec}
                </p>
              </div>
            )}
          </div>

          {/* Branch picker (draft only) */}
          {proposal.status === 'draft' && (
            <div className="mb-5">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Branch
              </h3>
              <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted" />
                <input
                  type="text"
                  value={branchName}
                  onChange={e => setBranchName(e.target.value)}
                  placeholder="proposals/feature-name"
                  className="flex-1 bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-dim">Branch where the agent will push changes</p>
            </div>
          )}

          {/* GitHub issue link */}
          {proposal.github_issue_number && githubRepo && (
            <div className="mb-5">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Issue
              </h3>
              <a
                href={`https://github.com/${githubRepo}/issues/${proposal.github_issue_number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm text-accent transition-colors hover:bg-surface-hover"
              >
                Issue #{proposal.github_issue_number}
                <ExternalLink className="ml-auto h-3 w-3 text-muted" />
              </a>
            </div>
          )}

          {/* Live progress tracker (approved proposals with active runs) */}
          {proposal.status === 'approved' && activeRunId && (
            <div className="mb-5">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Agent Progress
              </h3>
              <LiveLogTail projectId={projectId} runId={activeRunId} />
            </div>
          )}

          {/* Pipeline run + deployment preview (non-draft proposals with a related run) */}
          {relatedRun && proposal.status !== 'draft' && (
            <div className="mb-5">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Pipeline Run
              </h3>
              <div className="rounded-lg bg-surface p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    relatedRun.result === 'success' ? 'text-emerald-400 bg-emerald-400/10' :
                    relatedRun.result === 'failed' ? 'text-red-400 bg-red-400/10' :
                    'text-amber-400 bg-amber-400/10'
                  }`}>
                    {relatedRun.result ?? relatedRun.stage}
                  </span>
                  {relatedRun.github_pr_number && githubRepo && (
                    <a
                      href={`https://github.com/${githubRepo}/pull/${relatedRun.github_pr_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 text-xs text-accent transition-colors hover:text-fg"
                    >
                      PR #{relatedRun.github_pr_number}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <a
                    href={`/projects/${projectId}/runs/${relatedRun.id}`}
                    className={`flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg ${relatedRun.github_pr_number && githubRepo ? '' : 'ml-auto'}`}
                  >
                    View run <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              </div>

              {/* Deployment preview iframe */}
              <div className="mt-3">
                <DeploymentPreview projectId={projectId} runId={relatedRun.id} />
              </div>
            </div>
          )}

          {/* User notes */}
          {proposal.status === 'draft' && (
            <div className="mb-5">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Your Notes
              </h3>
              <textarea
                value={userNotes}
                onChange={e => setUserNotes(e.target.value)}
                placeholder="Add implementation guidance..."
                className="h-20 w-full rounded-lg bg-surface p-3 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}

          {/* Reject reason */}
          {showReject && (
            <div className="mb-5">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Rejection Reason
              </h3>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Why is this proposal not suitable?"
                className="h-20 w-full rounded-lg bg-surface p-3 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}
        </div>

        {/* Footer actions */}
        {proposal.status === 'draft' && (
          <div className="flex flex-col gap-2 border-t border-edge px-6 py-4">
            {/* Primary approve CTA */}
            <button
              onClick={() => handleAction('approve')}
              disabled={loading || approveSuccess}
              className="group flex w-full flex-col items-center justify-center gap-0.5 rounded-xl border border-success/20 bg-success/10 px-4 py-3.5 transition-all hover:border-success/35 hover:bg-success/20 hover:shadow-[0_0_24px_rgba(34,197,94,0.12)] disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-success">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve &amp; Create GitHub Issue
              </span>
              <span className="text-[11px] text-success/60">
                The agent will implement this automatically
              </span>
            </button>

            {/* Secondary reject action */}
            {!showReject ? (
              <button
                onClick={() => setShowReject(true)}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-surface px-4 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-fg"
              >
                <X className="h-4 w-4" />
                Reject
              </button>
            ) : (
              <button
                onClick={() => handleAction('reject')}
                disabled={loading}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-red-400/20 px-4 text-sm font-medium text-red-400 transition-colors hover:bg-red-400/30 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Confirm Reject
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
