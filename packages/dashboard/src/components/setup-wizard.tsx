'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { Github, Loader2, Check, ExternalLink, AlertCircle, Zap, Copy, CheckCheck } from 'lucide-react'
import { sileo } from 'sileo'
import { createClient } from '@/lib/supabase/client'
import { triggerSetup, resetSetupStatus } from '@/app/projects/[id]/actions'
import type { SetupStatus } from '@/lib/types'

type Props = {
  projectId: string
  githubRepo: string
  installationId: number | null
  initialStatus: SetupStatus
  initialPrUrl: string | null
  initialError: string | null
}

const STAGES: { key: SetupStatus; label: string }[] = [
  { key: 'queued', label: 'Waiting for worker' },
  { key: 'cloning', label: 'Cloning repository' },
  { key: 'generating', label: 'Generating setup files' },
  { key: 'committing', label: 'Creating pull request' },
]

const POLL_STATUSES: SetupStatus[] = ['queued', 'cloning', 'generating', 'committing', 'pr_created']

const ENV_SNIPPET = `ANTHROPIC_API_KEY=\nFEEDBACK_PASSWORD=easy`

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="rounded-md p-1 text-muted transition-colors hover:bg-white/10 hover:text-fg"
      title="Copy to clipboard"
    >
      {copied ? (
        <CheckCheck className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
}

export function SetupWizard({ projectId, githubRepo, installationId, initialStatus, initialPrUrl, initialError }: Props) {
  const [status, setStatus] = useState<SetupStatus>(initialStatus)
  const [prUrl, setPrUrl] = useState<string | null>(initialPrUrl)
  const [error, setError] = useState<string | null>(initialError)
  const [isPending, startTransition] = useTransition()

  // Poll for status updates during active setup + until PR URL is available
  useEffect(() => {
    const shouldPoll = POLL_STATUSES.includes(status) && !(status === 'pr_created' && prUrl)
    if (!shouldPoll) return

    const supabase = createClient()
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('projects')
        .select('setup_status, setup_pr_url, setup_error')
        .eq('id', projectId)
        .single()

      if (data) {
        setStatus(data.setup_status as SetupStatus)
        if (data.setup_pr_url) setPrUrl(data.setup_pr_url)
        if (data.setup_error) setError(data.setup_error)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [status, prUrl, projectId])

  const handleConnect = useCallback(() => {
    window.location.href = `/api/github-app/install?projectId=${projectId}`
  }, [projectId])

  const handleSetup = useCallback(() => {
    startTransition(async () => {
      const result = await triggerSetup(projectId)
      if (result.error) {
        sileo.error({ title: result.error })
        return
      }
      setStatus('queued')
      setError(null)
    })
  }, [projectId])

  const handleRetry = useCallback(() => {
    startTransition(async () => {
      // Reset status first, then immediately trigger a new setup job
      await resetSetupStatus(projectId)
      setError(null)
      setPrUrl(null)
      const result = await triggerSetup(projectId)
      if (result.error) {
        sileo.error({ title: result.error })
        setStatus('installing')
        return
      }
      setStatus('queued')
    })
  }, [projectId])

  // --- Not connected ---
  if (!installationId && status === 'pending') {
    return (
      <div className="mb-8">
        <div className="glass-card flex flex-col items-center px-8 py-10 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <Github className="h-5 w-5 text-accent" />
          </div>
          <h2 className="text-sm font-medium text-fg">Connect GitHub</h2>
          <p className="mt-1.5 max-w-xs text-xs text-muted">
            Link your repository to auto-install the feedback widget.
            We&apos;ll create a PR with everything configured.
          </p>
          <button
            onClick={handleConnect}
            className="btn-primary mt-5 flex h-10 items-center gap-2 rounded-xl px-6 text-sm font-medium"
          >
            <Github className="h-4 w-4" />
            Connect GitHub
          </button>
        </div>
      </div>
    )
  }

  // --- Connected, ready to set up ---
  if (installationId && status === 'installing') {
    return (
      <div className="mb-8">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Check className="h-5 w-5 text-success" />
            <h2 className="text-sm font-medium text-fg">GitHub Connected</h2>
          </div>
          <p className="text-xs text-muted mb-4">
            Ready to set up the feedback widget in <span className="text-fg font-medium">{githubRepo}</span>.
          </p>
          <button
            onClick={handleSetup}
            disabled={isPending}
            className="btn-primary flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-medium"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Set up my repo
          </button>
        </div>
      </div>
    )
  }

  // --- Setting up (live progress) ---
  if (POLL_STATUSES.includes(status) && status !== 'pr_created') {
    const activeIndex = STAGES.findIndex(s => s.key === status)
    return (
      <div className="mb-8">
        <div className="glass-card p-6">
          <h2 className="text-sm font-medium text-fg mb-4">Setting up your repo...</h2>
          <div className="space-y-3">
            {STAGES.map((stage, i) => {
              const isDone = i < activeIndex
              const isActive = i === activeIndex
              return (
                <div key={stage.key} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center">
                    {isDone ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : isActive ? (
                      <Loader2 className="h-4 w-4 text-accent animate-spin" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-white/10" />
                    )}
                  </div>
                  <span className={`text-xs ${isActive ? 'text-fg' : isDone ? 'text-muted' : 'text-white/20'}`}>
                    {stage.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // --- PR created ---
  if (status === 'pr_created' || status === 'complete') {
    return (
      <div className="mb-8">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Check className="h-5 w-5 text-success" />
            <h2 className="text-sm font-medium text-fg">
              {status === 'complete' ? 'Widget is live!' : 'PR ready!'}
            </h2>
          </div>
          {status !== 'complete' && (
            <>
              <p className="text-xs text-muted mb-4">
                Merge the PR to activate the widget.
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {prUrl ? (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-medium"
                  >
                    <Github className="h-3.5 w-3.5" />
                    View PR
                  </a>
                ) : (
                  <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-edge px-4 text-xs text-muted">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Fetching PR link...
                  </span>
                )}
                {prUrl && (
                  <a
                    href={`${prUrl}/checks`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-edge bg-surface px-4 text-xs font-medium text-fg transition-colors hover:bg-surface-hover"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Vercel Preview
                  </a>
                )}
              </div>
              <div className="rounded-lg bg-white/[0.04] p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-fg">After merging, add to <code className="text-fg">.env.local</code>:</p>
                  <CopyButton text={ENV_SNIPPET} />
                </div>
                <pre className="rounded-md bg-black/30 px-3 py-2 text-xs text-fg/80 leading-relaxed"><code>{ENV_SNIPPET}</code></pre>
                <p className="mt-2 text-[11px] text-muted">Then restart your dev server.</p>
              </div>
            </>
          )}
          {status === 'complete' && (
            <p className="text-xs text-success">
              The feedback widget is active in your app.
            </p>
          )}
        </div>
      </div>
    )
  }

  // --- Failed ---
  if (status === 'failed') {
    return (
      <div className="mb-8">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="h-5 w-5 text-danger" />
            <h2 className="text-sm font-medium text-fg">Setup failed</h2>
          </div>
          <p className="text-xs text-muted mb-3 line-clamp-3">{error ?? 'An unknown error occurred.'}</p>
          <button
            onClick={handleRetry}
            disabled={isPending}
            className="btn-primary flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-medium"
          >
            <Zap className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return null
}
