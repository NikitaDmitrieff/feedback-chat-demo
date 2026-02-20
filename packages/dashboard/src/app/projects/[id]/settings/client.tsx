'use client'

import { useCallback, useState } from 'react'
import { Brain, Compass, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { SetupSection } from '@/components/setup-section'
import type { SetupStatus } from '@/lib/types'

type Props = {
  projectId: string
  githubRepo: string
  installationId: number | null
  initialContext: string
  initialNudges: string[]
  initialSetupStatus: SetupStatus
  initialPrUrl: string | null
  initialError: string | null
  webhookSecret: string
  apiKey?: string
  webhookUrl: string
  agentUrl: string
  setupProgress: Record<string, boolean>
  hasRuns: boolean
}

export function SettingsPageClient({
  projectId,
  githubRepo,
  installationId,
  initialContext,
  initialNudges,
  initialSetupStatus,
  initialPrUrl,
  initialError,
  webhookSecret,
  apiKey,
  webhookUrl,
  agentUrl,
  setupProgress,
  hasRuns,
}: Props) {
  // Product context state
  const [context, setContext] = useState(initialContext)
  const [editingContext, setEditingContext] = useState(false)
  const [contextDraft, setContextDraft] = useState(initialContext)
  const [generating, setGenerating] = useState(false)
  const [savingContext, setSavingContext] = useState(false)

  // Nudges state
  const [nudges, setNudges] = useState(initialNudges)
  const [newNudge, setNewNudge] = useState('')
  const [savingNudges, setSavingNudges] = useState(false)

  const generateContext = useCallback(async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/context/generate`, { method: 'POST' })
      if (res.ok) {
        const json = await res.json()
        setContext(json.product_context)
        setContextDraft(json.product_context)
      }
    } finally {
      setGenerating(false)
    }
  }, [projectId])

  const saveContext = useCallback(async () => {
    setSavingContext(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_context: contextDraft }),
      })
      if (res.ok) {
        setContext(contextDraft)
        setEditingContext(false)
      }
    } finally {
      setSavingContext(false)
    }
  }, [projectId, contextDraft])

  const saveNudges = useCallback(async (updated: string[]) => {
    setSavingNudges(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategic_nudges: updated }),
      })
      if (res.ok) {
        setNudges(updated)
      }
    } finally {
      setSavingNudges(false)
    }
  }, [projectId])

  const addNudge = useCallback(() => {
    if (!newNudge.trim()) return
    const updated = [...nudges, newNudge.trim()]
    setNewNudge('')
    saveNudges(updated)
  }, [nudges, newNudge, saveNudges])

  const removeNudge = useCallback((index: number) => {
    const updated = nudges.filter((_, i) => i !== index)
    saveNudges(updated)
  }, [nudges, saveNudges])

  return (
    <div className="space-y-8">
      {/* Section 1: Product Context */}
      <div className="glass-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-fg">Product Context</h2>
          </div>
          <div className="flex items-center gap-2">
            {context && !editingContext && (
              <button
                onClick={() => { setContextDraft(context); setEditingContext(true) }}
                className="text-[11px] text-accent hover:text-fg"
              >
                Edit
              </button>
            )}
            <button
              onClick={generateContext}
              disabled={generating || !githubRepo}
              className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {context ? 'Regenerate' : 'Generate from GitHub'}
            </button>
          </div>
        </div>

        <p className="mb-3 text-xs text-muted">
          How the AI strategist understands your product. Auto-generated from your GitHub repo, or write your own.
        </p>

        {editingContext ? (
          <div>
            <textarea
              value={contextDraft}
              onChange={e => setContextDraft(e.target.value)}
              rows={6}
              className="w-full rounded-lg bg-white/[0.04] p-3 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Describe your product: what it is, who it's for, what matters most..."
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={saveContext}
                disabled={savingContext}
                className="rounded-lg bg-accent/20 px-3 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/30 disabled:opacity-50"
              >
                {savingContext ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditingContext(false); setContextDraft(context) }}
                className="text-[11px] text-muted hover:text-fg"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : context ? (
          <div className="rounded-lg bg-white/[0.04] p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{context}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/[0.08] p-4 text-center">
            <p className="text-xs text-muted">
              {githubRepo
                ? 'Click "Generate from GitHub" to auto-create your product context.'
                : 'Connect a GitHub repo first, or write your context manually.'}
            </p>
            {!githubRepo && (
              <button
                onClick={() => { setContextDraft(''); setEditingContext(true) }}
                className="mt-2 text-[11px] text-accent hover:text-fg"
              >
                Write manually
              </button>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Strategic Nudges */}
      <div className="glass-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Compass className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-fg">Strategic Nudges</h2>
        </div>

        <p className="mb-3 text-xs text-muted">
          Standing directives that guide all future proposal generation. The AI strategist treats these as high-priority constraints.
        </p>

        {nudges.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {nudges.map((nudge, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2"
              >
                <span className="text-sm text-fg">{nudge}</span>
                <button
                  onClick={() => removeNudge(i)}
                  disabled={savingNudges}
                  className="ml-2 rounded p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-fg disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newNudge}
            onChange={e => setNewNudge(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNudge() }}
            placeholder="e.g., Focus on mobile UX, Ignore performance for now..."
            className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={addNudge}
            disabled={!newNudge.trim() || savingNudges}
            className="flex items-center gap-1 rounded-lg bg-accent/10 px-3 py-2 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </div>

      {/* Section 3: Setup & Configuration (moved from Overview) */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-fg">Setup & Configuration</h2>
        <SetupSection
          projectId={projectId}
          githubRepo={githubRepo}
          installationId={installationId}
          initialStatus={initialSetupStatus}
          initialPrUrl={initialPrUrl}
          initialError={initialError}
          webhookSecret={webhookSecret}
          apiKey={apiKey}
          webhookUrl={webhookUrl}
          agentUrl={agentUrl}
          setupProgress={setupProgress}
          hasRuns={hasRuns}
        />
      </div>
    </div>
  )
}
