import { Activity, CheckCircle, Clock, Zap } from 'lucide-react'

type Run = {
  stage: string
  started_at: string
  completed_at: string | null
  result: string | null
}

export function StatsBar({ runs }: { runs: Run[] }) {
  const total = runs.length
  const completed = runs.filter((r) => r.result !== null)
  const deployed = completed.filter((r) => r.result === 'success').length
  const successRate = completed.length > 0 ? Math.round((deployed / completed.length) * 100) : 0

  const durations = completed
    .filter((r) => r.completed_at)
    .map((r) => new Date(r.completed_at!).getTime() - new Date(r.started_at).getTime())
  const avgMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
  const avgDuration = formatDuration(avgMs)

  const active = runs.filter((r) =>
    ['running', 'validating', 'queued'].includes(r.stage)
  ).length

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="stat-card">
        <div className="flex items-center gap-2 text-muted">
          <Activity className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wider">Total Runs</span>
        </div>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums text-fg">{total}</p>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-2 text-muted">
          <CheckCircle className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wider">Success Rate</span>
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <p className="text-2xl font-semibold tabular-nums text-fg">{successRate}%</p>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-success transition-all duration-500"
              style={{ width: `${successRate}%` }}
            />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-2 text-muted">
          <Clock className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wider">Avg Duration</span>
        </div>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums text-fg">
          {avgDuration || <span className="text-dim">&mdash;</span>}
        </p>
      </div>

      <div className={`stat-card ${active > 0 ? 'border-accent/30' : ''}`}>
        <div className="flex items-center gap-2 text-muted">
          <Zap className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wider">Active</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <p className="text-2xl font-semibold tabular-nums text-fg">{active}</p>
          {active > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms <= 0) return ''
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}
