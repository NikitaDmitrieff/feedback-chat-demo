'use client'

import { useState } from 'react'
import { Zap, Terminal } from 'lucide-react'
import { SetupWizard } from './setup-wizard'
import { SetupChecklist } from './setup-checklist'
import type { SetupStatus } from '@/lib/types'

type Props = {
  projectId: string
  githubRepo: string
  // Wizard-specific
  installationId: number | null
  initialStatus: SetupStatus
  initialPrUrl: string | null
  initialError: string | null
  // Checklist-specific
  webhookSecret: string
  apiKey?: string
  webhookUrl: string
  agentUrl: string
  setupProgress: Record<string, boolean>
  hasRuns: boolean
}

export function SetupSection({
  projectId,
  githubRepo,
  installationId,
  initialStatus,
  initialPrUrl,
  initialError,
  webhookSecret,
  apiKey,
  webhookUrl,
  agentUrl,
  setupProgress,
  hasRuns,
}: Props) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')

  return (
    <>
      <div className="mb-3 flex items-center gap-1">
        <button
          onClick={() => setMode('auto')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'auto' ? 'bg-white/10 text-fg' : 'text-muted hover:text-fg'
          }`}
        >
          <Zap className="h-3 w-3" />
          Auto setup
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'manual' ? 'bg-white/10 text-fg' : 'text-muted hover:text-fg'
          }`}
        >
          <Terminal className="h-3 w-3" />
          Manual setup
        </button>
      </div>

      {mode === 'auto' ? (
        <SetupWizard
          projectId={projectId}
          githubRepo={githubRepo}
          installationId={installationId}
          initialStatus={initialStatus}
          initialPrUrl={initialPrUrl}
          initialError={initialError}
        />
      ) : (
        <SetupChecklist
          projectId={projectId}
          githubRepo={githubRepo}
          webhookSecret={webhookSecret}
          apiKey={apiKey}
          webhookUrl={webhookUrl}
          agentUrl={agentUrl}
          setupProgress={setupProgress}
          hasRuns={hasRuns}
        />
      )}
    </>
  )
}
