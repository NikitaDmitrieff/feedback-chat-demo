import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, Github, ChevronRight, Folder } from 'lucide-react'

const ACTIVE_STAGES = ['created', 'queued', 'running', 'validating']

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, github_repo, created_at')
    .order('created_at', { ascending: false })

  // Fetch health stats for all projects in parallel bulk queries
  let statsByProject = new Map<string, { totalRuns: number; activeRuns: number }>()

  if (projects && projects.length > 0) {
    const projectIds = projects.map((p) => p.id)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: recentRuns } = await supabase
      .from('pipeline_runs')
      .select('project_id, stage')
      .in('project_id', projectIds)
      .gte('started_at', sevenDaysAgo)

    for (const run of recentRuns ?? []) {
      const current = statsByProject.get(run.project_id) ?? { totalRuns: 0, activeRuns: 0 }
      current.totalRuns++
      if (ACTIVE_STAGES.includes(run.stage)) current.activeRuns++
      statsByProject.set(run.project_id, current)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 pb-16">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-lg font-medium text-fg">Projects</h1>
        <Link
          href="/projects/new"
          className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          New Project
        </Link>
      </div>

      {/* Project list */}
      {!projects || projects.length === 0 ? (
        <div className="glass-card flex flex-col items-center px-8 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-elevated">
            <Folder className="h-5 w-5 text-muted" />
          </div>
          <p className="text-sm text-muted">No projects yet</p>
          <Link
            href="/projects/new"
            className="mt-4 flex items-center gap-1.5 text-sm text-fg transition-colors hover:text-white"
          >
            Create your first project
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => {
            const stats = statsByProject.get(p.id) ?? { totalRuns: 0, activeRuns: 0 }
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="glass-card group flex items-center gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-fg group-hover:text-white">
                    {p.name}
                  </h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <Github className="h-3 w-3 shrink-0" />
                    <span className="truncate">{p.github_repo}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mr-3">
                  {stats.activeRuns > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                      {stats.activeRuns} running
                    </span>
                  )}
                  {stats.totalRuns > 0 && (
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted tabular-nums">
                      {stats.totalRuns} runs
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted/50 transition-colors group-hover:text-muted" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
