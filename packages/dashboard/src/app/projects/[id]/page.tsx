import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

  // Show setup instructions if apiKey is in URL (just created)
  const showSetup = !!apiKey

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <h1>{project.name}</h1>
      <p style={{ color: '#666' }}>{project.github_repo}</p>

      {showSetup && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <h3>Setup Instructions</h3>
          <p>Add to your consumer app's <code>.env.local</code>:</p>
          <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: 12, borderRadius: 4, overflow: 'auto' }}>
{`AGENT_URL=https://app.feedback.chat/api/agent/${project.id}
FEEDBACK_CHAT_API_KEY=${apiKey}`}
          </pre>
          <p>Add this webhook to your GitHub repo ({project.github_repo}):</p>
          <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: 12, borderRadius: 4, overflow: 'auto' }}>
{`URL: https://app.feedback.chat/api/webhook/${project.id}
Secret: ${webhookSecret}
Content type: application/json
Events: Issues`}
          </pre>
          <p><strong>Save these now</strong> — the API key and webhook secret won't be shown again.</p>
        </div>
      )}

      <h2>Pipeline Runs</h2>
      {(!runs || runs.length === 0) ? (
        <p>No runs yet. Submit feedback through the widget to trigger a pipeline run.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Issue</th>
              <th style={{ padding: 8 }}>Triggered by</th>
              <th style={{ padding: 8 }}>Stage</th>
              <th style={{ padding: 8 }}>Result</th>
              <th style={{ padding: 8 }}>PR</th>
              <th style={{ padding: 8 }}>Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: 8 }}>#{run.github_issue_number}</td>
                <td style={{ padding: 8 }}>{run.triggered_by ?? '—'}</td>
                <td style={{ padding: 8 }}>{run.stage}</td>
                <td style={{ padding: 8 }}>{run.result ?? '—'}</td>
                <td style={{ padding: 8 }}>
                  {run.github_pr_number ? (
                    <a
                      href={`https://github.com/${project.github_repo}/pull/${run.github_pr_number}`}
                      target="_blank"
                      rel="noopener"
                    >
                      #{run.github_pr_number}
                    </a>
                  ) : '—'}
                </td>
                <td style={{ padding: 8 }}>{new Date(run.started_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 40 }}>Settings</h2>
      <dl>
        <dt>Webhook URL</dt>
        <dd><code>https://app.feedback.chat/api/webhook/{project.id}</code></dd>
        <dt>Webhook Secret</dt>
        <dd><code>{project.webhook_secret}</code></dd>
      </dl>
    </div>
  )
}
