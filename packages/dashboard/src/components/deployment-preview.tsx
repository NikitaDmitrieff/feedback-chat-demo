'use client'

import { useEffect, useState } from 'react'
import { Globe, ExternalLink } from 'lucide-react'
import type { DeploymentInfo } from '@/lib/types'

export function DeploymentPreview({ projectId, runId }: { projectId: string; runId: string }) {
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/runs/${projectId}/${runId}/deployment`)
      .then((res) => res.json())
      .then(setDeployment)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId, runId])

  if (loading) {
    return (
      <div className="glass-card p-5">
        <div className="skeleton h-4 w-48 mb-2" />
        <div className="skeleton h-32 w-full" />
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
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Globe className="h-3.5 w-3.5" />
          <span className="truncate">{deployment.previewUrl.replace('https://', '')}</span>
        </div>
        <a
          href={deployment.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent transition-colors hover:text-accent/80"
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
