import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetupSection } from '@/components/setup-section'
import type { SetupStatus } from '@/lib/types'
import { DigestCard } from '@/components/digest-card'
import { StatsBar } from '@/components/stats-bar'
import { RunsTable } from '@/components/runs-table'
import Link from 'next/link'
import { ArrowLeft, Github } from 'lucide-react'

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ apiKey?: string }>
}) {
  const { id } = await params
  const { apiKey } = await searchParams
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, github_repo, webhook_secret, created_at, setup_progress, github_installation_id, setup_status, setup_pr_url, setup_error')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('id, github_issue_number, github_pr_number, stage, triggered_by, started_at, completed_at, result')
    .eq('project_id', id)
    .order('started_at', { ascending: false })
    .limit(50)

  const hasRuns = !!runs && runs.length > 0

  const agentUrl = process.env.AGENT_URL ?? ''
  const webhookUrl = agentUrl ? `${agentUrl}/webhook/github` : ''

  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 pb-16">
      {/* Breadcrumb */}
      <Link
        href="/projects"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3 w-3" />
        All projects
      </Link>

      {/* Project header */}
      <div className="mb-8">
        <h1 className="text-lg font-medium text-fg">{project.name}</h1>
        {project.github_repo && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
            <Github className="h-3 w-3" />
            {project.github_repo}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <StatsBar runs={runs ?? []} />

      {/* Feedback digest */}
      <div className="mb-8">
        <DigestCard projectId={project.id} />
      </div>

      {/* Setup */}
      <SetupSection
        projectId={project.id}
        githubRepo={project.github_repo ?? ''}
        installationId={project.github_installation_id ?? null}
        initialStatus={(project.setup_status ?? 'pending') as SetupStatus}
        initialPrUrl={project.setup_pr_url ?? null}
        initialError={project.setup_error ?? null}
        webhookSecret={project.webhook_secret ?? ''}
        apiKey={apiKey}
        webhookUrl={webhookUrl}
        agentUrl={agentUrl}
        setupProgress={(project.setup_progress ?? {}) as Record<string, boolean>}
        hasRuns={hasRuns}
      />

      {/* Runs table */}
      <div className="mb-8">
        <h2 className="mb-4 text-sm font-medium text-fg">Pipeline Runs</h2>
        <RunsTable runs={runs ?? []} githubRepo={project.github_repo} projectId={project.id} />
      </div>
    </div>
  )
}
