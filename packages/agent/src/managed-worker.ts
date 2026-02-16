import { createSupabaseClient } from './supabase.js'
import { runManagedJob } from './worker.js'
import type { SupabaseClient } from '@supabase/supabase-js'

const POLL_INTERVAL_MS = 5_000
const WORKER_ID = `worker-${process.pid}-${Date.now()}`

async function pollForJobs(supabase: SupabaseClient) {
  const { data: job, error } = await supabase.rpc('claim_next_job', {
    p_worker_id: WORKER_ID,
  })

  if (error || !job) return null
  return job
}

async function fetchCredentials(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase
    .from('credentials')
    .select('type, encrypted_value')
    .eq('project_id', projectId)
    .single()

  if (!data) throw new Error(`No credentials for project ${projectId}`)

  return {
    claudeCredentials: data.type === 'claude_oauth' ? data.encrypted_value : undefined,
    anthropicApiKey: data.type === 'anthropic_api_key' ? data.encrypted_value : undefined,
  }
}

async function fetchGithubConfig(supabase: SupabaseClient, projectId: string) {
  const { data: project } = await supabase
    .from('projects')
    .select('github_repo')
    .eq('id', projectId)
    .single()

  if (!project) throw new Error(`Project ${projectId} not found`)

  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN must be set on the worker')

  return { token, repo: project.github_repo }
}

async function findRunId(supabase: SupabaseClient, projectId: string, issueNumber: number): Promise<string> {
  const { data } = await supabase
    .from('pipeline_runs')
    .select('id')
    .eq('project_id', projectId)
    .eq('github_issue_number', issueNumber)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) throw new Error(`No pipeline run found for issue #${issueNumber}`)
  return data.id
}

async function processJob(supabase: SupabaseClient, job: {
  id: string
  project_id: string
  github_issue_number: number
  issue_title: string
  issue_body: string
}) {
  console.log(`[${WORKER_ID}] Processing job ${job.id} (issue #${job.github_issue_number})`)

  try {
    const creds = await fetchCredentials(supabase, job.project_id)
    const github = await fetchGithubConfig(supabase, job.project_id)
    const runId = await findRunId(supabase, job.project_id, job.github_issue_number)

    await runManagedJob({
      issueNumber: job.github_issue_number,
      issueTitle: job.issue_title,
      issueBody: job.issue_body,
      projectId: job.project_id,
      github,
      ...creds,
      runId,
      supabase,
    })

    await supabase
      .from('job_queue')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', job.id)
  } catch (err) {
    console.error(`[${WORKER_ID}] Job ${job.id} failed:`, err)
    await supabase
      .from('job_queue')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', job.id)
  }
}

async function main() {
  const supabase = createSupabaseClient()
  console.log(`[${WORKER_ID}] Starting managed worker, polling every ${POLL_INTERVAL_MS}ms`)

  while (true) {
    const job = await pollForJobs(supabase)

    if (job) {
      await processJob(supabase, job)
    } else {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
  }
}

main().catch((err) => {
  console.error('Worker crashed:', err)
  process.exit(1)
})
