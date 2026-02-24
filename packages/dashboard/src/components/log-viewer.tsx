'use client'

import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import type { RunLog } from '@/lib/types'

function logLevelClass(level: string): string {
  switch (level) {
    case 'error': return 'text-danger'
    case 'warn': return 'text-[#fbbf24]'
    case 'success': return 'text-success'
    default: return 'text-dim'
  }
}

export function LogViewer({ projectId, runId }: { projectId: string; runId: string }) {
  const [logs, setLogs] = useState<RunLog[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/runs/${projectId}/${runId}/logs`)
      .then((res) => res.json())
      .then((data) => setLogs(data.logs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId, runId])

  function copyLogs() {
    const text = logs
      .map((log) => `${new Date(log.timestamp).toLocaleTimeString()} [${log.level}] ${log.message}`)
      .join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) {
    return (
      <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-[#0d0d0f]">
        <div className="border-b border-white/[0.06] px-4 py-2.5">
          <div className="skeleton h-3 w-24" />
        </div>
        <div className="px-4 py-4 space-y-2">
          <div className="skeleton h-3.5 w-64" />
          <div className="skeleton h-3.5 w-48" />
          <div className="skeleton h-3.5 w-56" />
        </div>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[#0d0d0f] px-4 py-8 text-center">
        <p className="font-mono text-xs text-muted">No logs available for this run.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.06]">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-[#0d0d0f] border-b border-white/[0.06] px-4 py-2.5">
        <span className="font-mono text-xs text-dim">{logs.length} lines</span>
        <button
          onClick={copyLogs}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          {copied
            ? <><Check className="h-3.5 w-3.5 text-success" />Copied!</>
            : <><Copy className="h-3.5 w-3.5" />Copy logs</>
          }
        </button>
      </div>

      {/* Log lines */}
      <div
        className="bg-[#0d0d0f] max-h-[480px] overflow-y-auto font-mono text-xs leading-relaxed"
        style={{ scrollbarWidth: 'none' }}
      >
        {logs.map((log, i) => (
          <div
            key={log.id}
            className="group flex gap-0 hover:bg-white/[0.02] px-4 py-[1px]"
          >
            {/* Line number */}
            <span className="shrink-0 w-9 text-right text-white/20 select-none mr-4 tabular-nums">
              {i + 1}
            </span>
            {/* Timestamp */}
            <span className="shrink-0 text-white/30 tabular-nums mr-4">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            {/* Message */}
            <span className={logLevelClass(log.level)}>
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
