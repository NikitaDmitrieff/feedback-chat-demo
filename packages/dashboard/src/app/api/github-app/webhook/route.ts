import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyWebhookSignature } from '@/lib/github-app'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'feedback_chat' } },
  )
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const event = request.headers.get('x-github-event')
  const payload = JSON.parse(rawBody)
  const repoFullName = payload.repository?.full_name

  if (!repoFullName) {
    return NextResponse.json({ status: 'ignored', reason: 'no repository' })
  }

  const supabase = supabaseAdmin()

  // Find project by repo name (only GitHub App projects)
  const { data: project } = await supabase
    .from('projects')
    .select('id, github_installation_id')
    .eq('github_repo', repoFullName)
    .not('github_installation_id', 'is', null)
    .limit(1)
    .single()

  if (!project) {
    return NextResponse.json({ status: 'ignored', reason: 'no matching project' })
  }

  if (event === 'issues') return handleIssues(supabase, project.id, payload)
  if (event === 'issue_comment') return handleComment(supabase, project.id, payload)
  if (event === 'pull_request') return handlePR(supabase, project.id, payload)

  return NextResponse.json({ status: 'ignored', reason: `unhandled event: ${event}` })
}

// --- Issues: trigger agent pipeline (same logic as /api/webhook/[projectId]) ---

async function handleIssues(
  supabase: ReturnType<typeof supabaseAdmin>,
  projectId: string,
  payload: Record<string, unknown>,
) {
  const action = payload.action as string
  const issue = payload.issue as Record<string, unknown>
  const labels: string[] = ((issue?.labels as { name: string }[]) ?? []).map(l => l.name)

  // Accept: opened, reopened, or labeled with auto-implement
  const isTriggering =
    action === 'opened' ||
    action === 'reopened' ||
    (action === 'labeled' && labels.includes('auto-implement'))

  if (!isTriggering) return NextResponse.json({ status: 'ignored' })
  if (!labels.includes('feedback-bot')) return NextResponse.json({ status: 'ignored' })
  if (labels.includes('in-progress') || labels.includes('agent-failed')) {
    return NextResponse.json({ status: 'ignored' })
  }

  const issueNumber = issue.number as number

  // Dedup check
  const { count } = await supabase
    .from('job_queue')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('github_issue_number', issueNumber)
    .in('status', ['pending', 'processing'])

  if (count && count > 0) {
    return NextResponse.json({ status: 'already_queued' })
  }

  // Enqueue agent job
  const { data: job } = await supabase
    .from('job_queue')
    .insert({
      project_id: projectId,
      job_type: 'agent',
      github_issue_number: issueNumber,
      issue_title: (issue.title as string) ?? '',
      issue_body: (issue.body as string) ?? '',
    })
    .select('id')
    .single()

  if (!job) return NextResponse.json({ error: 'Failed to enqueue' }, { status: 500 })

  await supabase.from('pipeline_runs').insert({
    job_id: job.id,
    project_id: projectId,
    github_issue_number: issueNumber,
    stage: 'queued',
    triggered_by: (issue?.user as Record<string, unknown>)?.login as string | null,
  })

  return NextResponse.json({ status: 'queued' })
}

// --- Issue comments: detect retry requests ---

async function handleComment(
  supabase: ReturnType<typeof supabaseAdmin>,
  projectId: string,
  payload: Record<string, unknown>,
) {
  if ((payload.action as string) !== 'created') {
    return NextResponse.json({ status: 'ignored' })
  }

  const comment = payload.comment as Record<string, unknown>
  const body = (comment?.body as string) ?? ''
  if (!body.startsWith('**Modifications demandées :**')) {
    return NextResponse.json({ status: 'ignored' })
  }

  const issue = payload.issue as Record<string, unknown>
  const labels: string[] = ((issue?.labels as { name: string }[]) ?? []).map(l => l.name)
  if (!labels.includes('auto-implement')) {
    return NextResponse.json({ status: 'ignored' })
  }

  const { data: job } = await supabase
    .from('job_queue')
    .insert({
      project_id: projectId,
      job_type: 'agent',
      github_issue_number: issue.number as number,
      issue_title: (issue.title as string) ?? '',
      issue_body: `${(issue.body as string) ?? ''}\n\n---\nRetry requested:\n${body}`,
    })
    .select('id')
    .single()

  if (job) {
    await supabase.from('pipeline_runs').insert({
      job_id: job.id,
      project_id: projectId,
      github_issue_number: issue.number as number,
      stage: 'queued',
      triggered_by: (comment?.user as Record<string, unknown>)?.login as string | null,
    })
  }

  return NextResponse.json({ status: 'retry_queued' })
}

// --- Pull request merge: detect setup PR completion ---

async function handlePR(
  supabase: ReturnType<typeof supabaseAdmin>,
  projectId: string,
  payload: Record<string, unknown>,
) {
  if ((payload.action as string) !== 'closed') {
    return NextResponse.json({ status: 'ignored' })
  }

  const pr = payload.pull_request as Record<string, unknown>
  const merged = pr?.merged as boolean
  const headRef = (pr?.head as Record<string, unknown>)?.ref as string

  if (merged && headRef === 'feedback-chat/setup') {
    await supabase
      .from('projects')
      .update({ setup_status: 'complete' })
      .eq('id', projectId)
    return NextResponse.json({ status: 'setup_complete' })
  }

  return NextResponse.json({ status: 'ignored' })
}
