import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import Link from 'next/link'
import { ArrowLeft, Github, ExternalLink, Copy, AlertCircle, CheckCircle2 } from 'lucide-react'

type Stage = 'created' | 'queued' | 'running' | 'validating' | 'preview_ready' | 'deployed' | 'failed' | 'rejected'

function StageBadge({ stage }: { stage: string }) {
  const label: Record<string, string> = {
    created: 'Created',
    queued: 'Queued',
    running: 'Running',
    validating: 'Validating',
    preview_ready: 'Preview',
    deployed: 'Deployed',
    failed: 'Failed',
    rejected: 'Rejected',
  }

  return (
    <span className={`stage-badge stage-${stage}`}>
      {stage === 'running' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {label[stage] ?? stage}
    </span>
  )
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <div className="code-block flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all">{value}</code>
      </div>
    </div>
  )
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ apiKey?: string; webhookSecret?: string }>
}) {
  const { id } = await params
  const { apiKey, webhookSecret } = await searchParams
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, github_repo, webhook_secret, created_at')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('id, github_issue_number, github_pr_number, stage, triggered_by, started_at, completed_at, result')
    .eq('project_id', id)
    .order('started_at', { ascending: false })
    .limit(50)

  const showSetup = !!apiKey

  return (
    <>
      <Nav />
      <div className="mx-auto max-w-5xl px-6 pt-24 pb-16">
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
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
            <Github className="h-3 w-3" />
            {project.github_repo}
          </div>
        </div>

        {/* Setup banner */}
        {showSetup && (
          <div className="glass-card mb-8 overflow-hidden border-accent/20">
            <div className="flex items-center gap-3 border-b border-edge px-5 py-3">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm font-medium text-fg">Project created — save these credentials</span>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-xs text-muted">
                Add to your consumer app&apos;s <code className="rounded bg-elevated px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-fg">.env.local</code>:
              </p>
              <div className="code-block">
{`AGENT_URL=https://app.feedback.chat/api/agent/${project.id}
FEEDBACK_CHAT_API_KEY=${apiKey}`}
              </div>

              <p className="text-xs text-muted">
                GitHub webhook for <code className="rounded bg-elevated px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-fg">{project.github_repo}</code>:
              </p>
              <div className="code-block">
{`URL: https://app.feedback.chat/api/webhook/${project.id}
Secret: ${webhookSecret}
Content type: application/json
Events: Issues`}
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-danger/5 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                <p className="text-xs text-danger/80">
                  Save these now — the API key and webhook secret won&apos;t be shown again.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Runs table */}
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-medium text-fg">Pipeline Runs</h2>

          {!runs || runs.length === 0 ? (
            <div className="glass-card px-5 py-10 text-center">
              <p className="text-sm text-muted">
                No runs yet. Submit feedback through the widget to trigger a pipeline run.
              </p>
            </div>
          ) : (
            <div className="glass-card overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-edge text-xs text-muted">
                    <th className="px-5 py-3 font-medium">Issue</th>
                    <th className="px-5 py-3 font-medium">Triggered by</th>
                    <th className="px-5 py-3 font-medium">Stage</th>
                    <th className="px-5 py-3 font-medium">Result</th>
                    <th className="px-5 py-3 font-medium">PR</th>
                    <th className="px-5 py-3 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className="border-b border-edge/50 transition-colors last:border-0 hover:bg-surface-hover"
                    >
                      <td className="px-5 py-3 font-[family-name:var(--font-mono)] text-xs text-fg">
                        #{run.github_issue_number}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted">
                        {run.triggered_by ?? <span className="text-dim">&mdash;</span>}
                      </td>
                      <td className="px-5 py-3">
                        <StageBadge stage={run.stage} />
                      </td>
                      <td className="px-5 py-3 text-xs text-muted">
                        {run.result ?? <span className="text-dim">&mdash;</span>}
                      </td>
                      <td className="px-5 py-3">
                        {run.github_pr_number ? (
                          <a
                            href={`https://github.com/${project.github_repo}/pull/${run.github_pr_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-accent transition-colors hover:text-accent/80"
                          >
                            #{run.github_pr_number}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <span className="text-xs text-dim">&mdash;</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted tabular-nums">
                        {new Date(run.started_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Settings */}
        <div>
          <h2 className="mb-4 text-sm font-medium text-fg">Settings</h2>
          <div className="glass-card space-y-4 p-5">
            <CopyBlock
              label="Webhook URL"
              value={`https://app.feedback.chat/api/webhook/${project.id}`}
            />
            <CopyBlock
              label="Webhook Secret"
              value={project.webhook_secret}
            />
          </div>
        </div>
      </div>
    </>
  )
}
