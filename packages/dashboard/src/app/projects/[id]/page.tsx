import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DigestCard } from '@/components/digest-card'
import { StatsBar } from '@/components/stats-bar'
import { RunsTable } from '@/components/runs-table'
import { Github, Sparkles, Lightbulb, MessageSquare, ArrowRight } from 'lucide-react'
import { DeleteProjectButton } from '@/components/delete-project-button'
import { ProposalsCard } from '@/components/proposals-card'
import { PipelineExplainer } from '@/components/pipeline-explainer'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, github_repo, product_context, webhook_secret, created_at, setup_progress, github_installation_id, setup_status, setup_pr_url, setup_error')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('id, github_issue_number, github_pr_number, stage, triggered_by, started_at, completed_at, result')
    .eq('project_id', id)
    .order('started_at', { ascending: false })
    .limit(50)

  const [{ data: feedbackSessions }, { count: totalSessionCount }, { data: draftProposals }] = await Promise.all([
    supabase
      .from('feedback_sessions')
      .select('id, github_issue_number, tester_name, ai_summary, ai_themes')
      .eq('project_id', id)
      .not('github_issue_number', 'is', null),
    supabase
      .from('feedback_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', id),
    supabase
      .from('proposals')
      .select('id')
      .eq('project_id', id)
      .eq('status', 'draft'),
  ])

  const feedbackByIssue = new Map<number, { session_id: string; tester_name: string | null; ai_summary: string | null; ai_themes: string[] | null }>()
  if (feedbackSessions) {
    for (const s of feedbackSessions) {
      if (s.github_issue_number != null) {
        feedbackByIssue.set(s.github_issue_number, {
          session_id: s.id,
          tester_name: s.tester_name,
          ai_summary: s.ai_summary,
          ai_themes: s.ai_themes,
        })
      }
    }
  }

  const enrichedRuns = (runs ?? []).map(run => ({
    ...run,
    feedback_source: feedbackByIssue.get(run.github_issue_number) ?? null,
  }))

  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 pb-16">
      {/* Project header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-medium text-fg">{project.name}</h1>
          {project.github_repo && (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
              <Github className="h-3 w-3" />
              {project.github_repo}
            </div>
          )}
        </div>
        <DeleteProjectButton projectId={project.id} />
      </div>

      {/* Stats bar */}
      <StatsBar runs={runs ?? []} />

      {/* Feedback digest */}
      <div className="mb-8">
        <DigestCard projectId={project.id} />
      </div>

      {/* Proposals */}
      <div className="mb-8">
        <ProposalsCard projectId={project.id} />
      </div>

      {/* Next Actions */}
      {(() => {
        const actions: { key: string; href: string; icon: typeof Github; title: string; description: string }[] = []
        if (project.setup_status !== 'complete' && project.setup_status !== 'pr_created') {
          actions.push({ key: 'setup', href: `/projects/${id}/settings`, icon: Github, title: 'Set up GitHub repo', description: 'Connect your repo to enable the pipeline.' })
        }
        if (!project.product_context) {
          actions.push({ key: 'context', href: `/projects/${id}/settings`, icon: Sparkles, title: 'Add product context', description: 'Improve proposal quality with project details.' })
        }
        if ((draftProposals?.length ?? 0) > 0) {
          actions.push({ key: 'proposals', href: `/projects/${id}/minions`, icon: Lightbulb, title: `Review proposals (${draftProposals!.length})`, description: 'Draft proposals are waiting for your review.' })
        }
        if ((totalSessionCount ?? 0) === 0) {
          actions.push({ key: 'feedback', href: `/projects/${id}/feedback`, icon: MessageSquare, title: 'Send first feedback', description: 'Start collecting user feedback.' })
        }
        if (actions.length === 0) return null
        return (
          <div className="mb-8">
            <h2 className="mb-4 text-sm font-medium text-fg">Next Actions</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {actions.map(action => (
                <Link
                  key={action.key}
                  href={action.href}
                  className="glass-card flex items-start gap-3 p-4 transition-colors hover:bg-white/[0.06]"
                >
                  <action.icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{action.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{action.description}</p>
                  </div>
                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted" />
                </Link>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Pipeline explainer (shown when no runs yet) */}
      {(runs ?? []).length === 0 && (
        <div className="mb-8">
          <PipelineExplainer />
        </div>
      )}

      {/* Runs table */}
      <div className="mb-8">
        <h2 className="mb-4 text-sm font-medium text-fg">Pipeline Runs</h2>
        <RunsTable runs={enrichedRuns} githubRepo={project.github_repo} projectId={project.id} />
      </div>
    </div>
  )
}
