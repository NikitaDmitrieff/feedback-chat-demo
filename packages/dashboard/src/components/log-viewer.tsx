'use client'

import { useEffect, useState } from 'react'
import type { RunLog } from '@/lib/types'

export function LogViewer({ projectId, runId }: { projectId: string; runId: string }) {
  const [logs, setLogs] = useState<RunLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/runs/${projectId}/${runId}/logs`)
      .then((res) => res.json())
      .then((data) => setLogs(data.logs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId, runId])

  if (loading) {
    return (
      <div className="code-block">
        <div className="skeleton h-4 w-64 mb-2" />
        <div className="skeleton h-4 w-48 mb-2" />
        <div className="skeleton h-4 w-56" />
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="code-block text-center text-muted">
        No logs available for this run.
      </div>
    )
  }

  return (
    <div className="code-block max-h-[500px] overflow-y-auto whitespace-pre-wrap">
      {logs.map((log) => (
        <div key={log.id} className="flex gap-3">
          <span className="shrink-0 text-dim tabular-nums">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span
            className={
              log.level === 'error'
                ? 'text-danger'
                : log.level === 'warn'
                  ? 'text-[#fbbf24]'
                  : ''
            }
          >
            {log.message}
          </span>
        </div>
      ))}
    </div>
  )
}
