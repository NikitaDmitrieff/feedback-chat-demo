'use client'

import { useEffect, useState } from 'react'
import { Globe, ExternalLink, Sparkles } from 'lucide-react'
import type { DeploymentInfo } from '@/lib/types'

const PREVIEW_STAGES = ['preview_ready', 'deployed']

export function DeploymentPreview({
  projectId,
  runId,
  stage,
}: {
  projectId: string
  runId: string
  stage?: string
}) {
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const isPreviewActive = stage ? PREVIEW_STAGES.includes(stage) : false

  useEffect(() => {
    fetch(`/api/runs/${projectId}/${runId}/deployment`)
      .then((res) => res.json())
      .then(setDeployment)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId, runId])

  if (loading) {
    return (
      <div className={`glass-card overflow-hidden ${isPreviewActive ? 'ring-1 ring-success/20' : ''}`}>
        <div className="skeleton h-4 w-48 m-5 mb-3" />
        <div className="skeleton h-32 w-full rounded-none" />
      </div>
    )
  }

  if (!deployment?.previewUrl) {
    return (
      <div className="glass-card px-5 py-8 text-center">
        <Globe className="mx-auto mb-2 h-5 w-5 text-muted" />
        <p className="text-sm text-muted">
          {deployment?.description ?? 'No deployment preview available.'}
        </p>
      </div>
    )
  }

  return (
    <div className={`glass-card overflow-hidden transition-all ${isPreviewActive ? 'ring-1 ring-success/30 shadow-[0_0_24px_rgba(34,197,94,0.06)]' : ''}`}>
      {/* Preview-ready banner */}
      {isPreviewActive && (
        <div className="flex items-center gap-2 bg-success/10 border-b border-success/20 px-4 py-2.5">
          <Sparkles className="h-3.5 w-3.5 text-success shrink-0" />
          <span className="text-xs font-medium text-success">
            {stage === 'deployed' ? 'Deployed to production' : 'Preview ready — review the changes below'}
          </span>
        </div>
      )}

      {/* URL bar */}
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5 bg-surface">
        <div className="flex items-center gap-2 text-xs text-muted min-w-0">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{deployment.previewUrl.replace('https://', '')}</span>
        </div>
        <a
          href={deployment.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-3 shrink-0 text-xs text-accent transition-colors hover:text-accent/80"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <iframe
        src={deployment.previewUrl}
        className="h-[400px] w-full border-0 bg-white"
        title="Deployment preview"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  )
}
