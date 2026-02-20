import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { SetupStatus } from '@/lib/types'
import { SettingsPageClient } from './client'

export default async function SettingsPage({
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
    .select('id, name, github_repo, product_context, strategic_nudges, webhook_secret, github_installation_id, setup_status, setup_pr_url, setup_error, setup_progress')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const hasRuns = !!(await supabase
    .from('pipeline_runs')
    .select('id')
    .eq('project_id', id)
    .limit(1)
    .single()).data

  const agentUrl = process.env.AGENT_URL ?? ''
  const webhookUrl = agentUrl ? `${agentUrl}/webhook/github` : ''

  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 pb-16">
      <Link
        href={`/projects/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3 w-3" />
        {project.name}
      </Link>

      <h1 className="mb-8 text-lg font-medium text-fg">Settings</h1>

      <SettingsPageClient
        projectId={project.id}
        githubRepo={project.github_repo ?? ''}
        installationId={project.github_installation_id ?? null}
        initialContext={project.product_context ?? ''}
        initialNudges={(project.strategic_nudges ?? []) as string[]}
        initialSetupStatus={(project.setup_status ?? 'pending') as SetupStatus}
        initialPrUrl={project.setup_pr_url ?? null}
        initialError={project.setup_error ?? null}
        webhookSecret={project.webhook_secret ?? ''}
        apiKey={apiKey}
        webhookUrl={webhookUrl}
        agentUrl={agentUrl}
        setupProgress={(project.setup_progress ?? {}) as Record<string, boolean>}
        hasRuns={hasRuns}
      />
    </div>
  )
}
