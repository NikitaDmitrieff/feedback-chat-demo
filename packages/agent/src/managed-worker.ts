import { createSupabaseClient } from './supabase.js'
import { runManagedJob } from './worker.js'
import { runSetupJob } from './setup-worker.js'
import { classifyFailure } from './classify-failure.js'
import { runSelfImproveJob } from './self-improve-worker.js'
import { getInstallationToken, getInstallationFirstRepo, isGitHubAppConfigured } from './github-app.js'
import { initCredentials, ensureValidToken } from './oauth.js'
type Supabase = ReturnType<typeof createSupabaseClient>

const POLL_INTERVAL_MS = 5_000
const STALE_THRESHOLD_MINUTES = 30
const MAX_ATTEMPTS = 3
const MAX_BACKOFF_MS = 60_000
const WORKER_ID = `worker-${process.pid}-${Date.now()}`

async function reapStaleJobs(supabase: Supabase) {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60_000).toISOString()

  const { data: staleJobs } = await supabase
    .from('job_queue')
    .select('id, attempt_count')
    .eq('status', 'processing')
    .lt('locked_at', cutoff)

  if (!staleJobs?.length) return

  for (const job of staleJobs) {
    if (job.attempt_count >= MAX_ATTEMPTS) {
      await supabase
        .from('job_queue')
        .update({
          status: 'failed',
          last_error: `Stale after ${MAX_ATTEMPTS} attempts (locked_at exceeded ${STALE_THRESHOLD_MINUTES}m)`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .eq('status', 'processing')
      console.log(`[${WORKER_ID}] Reaped stale job ${job.id} → failed (exhausted)`)
    } else {
      await supabase
        .from('job_queue')
        .update({
          status: 'pending',
          worker_id: null,
          locked_at: null,
          last_error: `Reset by reaper (attempt ${job.attempt_count}/${MAX_ATTEMPTS})`,
        })
        .eq('id', job.id)
        .eq('status', 'processing')
      console.log(`[${WORKER_ID}] Reaped stale job ${job.id} → pending (attempt ${job.attempt_count}/${MAX_ATTEMPTS})`)
    }
  }
}

async function pollForJobs(supabase: Supabase) {
  const { data: job, error } = await supabase.rpc('claim_next_job', {
    p_worker_id: WORKER_ID,
    p_skip_setup: false,
  })

  if (error || !job) return null
  return job
}

async function fetchCredentials(supabase: Supabase, projectId: string) {
  const { data } = await supabase
    .from('credentials')
    .select('type, encrypted_value')
    .eq('project_id', projectId)
    .single()

  if (data) {
    return {
      claudeCredentials: data.type === 'claude_oauth' ? data.encrypted_value : undefined,
      anthropicApiKey: data.type === 'anthropic_api_key' ? data.encrypted_value : undefined,
    }
  }

  // Fall back to system credentials (the dashboard owner's credential)
  const claudeCredentials = process.env.CLAUDE_CREDENTIALS_JSON
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY
  if (!claudeCredentials && !anthropicApiKey) {
    throw new Error(`No credentials for project ${projectId} and no system credential configured`)
  }
  console.log(`[${WORKER_ID}] No project credential found — using system credential`)
  return { claudeCredentials, anthropicApiKey }
}

async function fetchGithubConfig(supabase: Supabase, projectId: string) {
  const { data: project } = await supabase
    .from('projects')
    .select('github_repo, github_installation_id')
    .eq('id', projectId)
    .single()

  if (!project) throw new Error(`Project ${projectId} not found`)

  // For GitHub App projects, use an installation token
  if (project.github_installation_id && isGitHubAppConfigured()) {
    const token = await getInstallationToken(project.github_installation_id)
    return { token, repo: project.github_repo }
  }

  // Fallback: use GITHUB_TOKEN env var (legacy PAT-based projects)
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN must be set on the worker')

  return { token, repo: project.github_repo }
}

async function findRunId(supabase: Supabase, projectId: string, issueNumber: number): Promise<string> {
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

async function handleFailedJob(
  supabase: Supabase,
  job: { id: string; project_id: string; job_type?: string; github_issue_number: number; issue_body: string },
) {
  // Recursion guard: never classify self_improve failures
  if (job.job_type === 'self_improve' || job.job_type === 'setup') return

  try {
    // Find the run ID for this job
    const { data: run } = await supabase
      .from('pipeline_runs')
      .select('id')
      .eq('project_id', job.project_id)
      .eq('github_issue_number', job.github_issue_number)
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    if (!run) return

    // Fetch logs for classification
    const { data: logs } = await supabase
      .from('run_logs')
      .select('level, message')
      .eq('run_id', run.id)
      .order('timestamp', { ascending: false })
      .limit(100)

    const { data: jobData } = await supabase
      .from('job_queue')
      .select('last_error')
      .eq('id', job.id)
      .single()

    // Classify
    const classification = await classifyFailure({
      logs: (logs || []).reverse(),
      lastError: jobData?.last_error || '',
      issueBody: job.issue_body,
      jobType: job.job_type || 'implement',
    })

    if (!classification) return

    // Store classification on the pipeline run
    await supabase
      .from('pipeline_runs')
      .update({
        failure_category: classification.category,
        failure_analysis: classification.analysis,
      })
      .eq('id', run.id)

    console.log(`[${WORKER_ID}] Classified failure for run ${run.id}: ${classification.category}`)

    // Only spawn improvement job for our-fault categories
    if (!['docs_gap', 'widget_bug', 'agent_bug'].includes(classification.category)) return

    // Create self-improvement job
    const payload = JSON.stringify({
      fix_summary: classification.fix_summary,
      original_issue_body: job.issue_body.slice(0, 2000),
      log_excerpts: (logs || [])
        .reverse()
        .map((l: { level: string; message: string }) => `[${l.level}] ${l.message}`)
        .join('\n')
        .slice(-3000),
    })

    const { data: newJob } = await supabase
      .from('job_queue')
      .insert({
        project_id: job.project_id,
        github_issue_number: 0, // not tied to a consumer issue
        issue_title: `Self-improve: ${classification.category}`,
        issue_body: payload,
        job_type: 'self_improve',
        source_run_id: run.id,
        status: 'pending',
      })
      .select('id')
      .single()

    if (newJob) {
      console.log(`[${WORKER_ID}] Spawned self-improvement job ${newJob.id} (category: ${classification.category})`)
    }
  } catch (err) {
    console.error(`[${WORKER_ID}] Failed to classify/spawn improvement:`, err instanceof Error ? err.message : err)
  }
}

async function processJob(supabase: Supabase, job: {
  id: string
  project_id: string
  job_type?: string
  attempt_count?: number
  github_issue_number: number
  issue_title: string
  issue_body: string
  source_run_id?: string
}) {
  console.log(`[${WORKER_ID}] Processing job ${job.id} (type=${job.job_type ?? 'implement'}, ${job.job_type === 'self_improve' ? `source_run=${job.source_run_id}` : `issue #${job.github_issue_number}`})`)

  try {
    // Dispatch based on job type
    if (job.job_type === 'setup') {
      const { data: project } = await supabase
        .from('projects')
        .select('github_repo, github_installation_id')
        .eq('id', job.project_id)
        .single()

      if (!project?.github_installation_id) {
        throw new Error('Setup job requires github_installation_id on the project')
      }

      // Auto-detect github_repo if missing
      let githubRepo = project.github_repo
      if (!githubRepo) {
        console.log(`[${WORKER_ID}] github_repo missing, auto-detecting from installation ${project.github_installation_id}...`)
        githubRepo = await getInstallationFirstRepo(project.github_installation_id) ?? ''
        if (githubRepo) {
          await supabase.from('projects').update({ github_repo: githubRepo }).eq('id', job.project_id)
          console.log(`[${WORKER_ID}] Auto-detected repo: ${githubRepo}`)
        } else {
          throw new Error('Could not detect GitHub repo from installation. Please reconnect the GitHub App.')
        }
      }

      await runSetupJob({
        jobId: job.id,
        projectId: job.project_id,
        githubRepo,
        installationId: project.github_installation_id,
        supabase,
      })
    } else if (job.job_type === 'self_improve') {
      // Self-improvement job: clone feedback-chat and fix it
      const { data: sourceRun } = await supabase
        .from('pipeline_runs')
        .select('failure_category, failure_analysis')
        .eq('id', job.source_run_id)
        .single()

      if (!sourceRun?.failure_category) {
        throw new Error(`Source run ${job.source_run_id} has no failure classification`)
      }

      // Parse the fix_summary from the job's issue_body (we store it as JSON)
      let payload: { fix_summary?: string; original_issue_body?: string; log_excerpts?: string } = {}
      try { payload = JSON.parse(job.issue_body) } catch {}

      const result = await runSelfImproveJob({
        jobId: job.id,
        sourceRunId: job.source_run_id!,
        failureCategory: sourceRun.failure_category,
        failureAnalysis: sourceRun.failure_analysis || '',
        fixSummary: payload.fix_summary || '',
        originalIssueBody: payload.original_issue_body || '',
        logExcerpts: payload.log_excerpts || '',
        supabase,
      })

      if (result.prUrl) {
        // Link the improvement job back to the source run
        await supabase
          .from('pipeline_runs')
          .update({ improvement_job_id: job.id })
          .eq('id', job.source_run_id)
      }
    } else {
      // Default: implement job (existing flow)
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
    }

    await supabase
      .from('job_queue')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', job.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${WORKER_ID}] Job ${job.id} failed:`, message)

    const isOAuthError = /authentication_error|invalid_grant|\b401\b|OAuth/i.test(message)

    try {
      if (isOAuthError) {
        // OAuth errors are permanent — no retry
        await supabase
          .from('job_queue')
          .update({
            status: 'failed',
            last_error: `OAuth error (no retry): ${message}`,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id)
        await handleFailedJob(supabase, job)
      } else if ((job.attempt_count ?? 0) + 1 < MAX_ATTEMPTS) {
        // Retryable — reset to pending
        await supabase
          .from('job_queue')
          .update({
            status: 'pending',
            worker_id: null,
            locked_at: null,
            last_error: message,
          })
          .eq('id', job.id)
        console.log(`[${WORKER_ID}] Job ${job.id} reset to pending for retry`)
      } else {
        // Exhausted retries
        await supabase
          .from('job_queue')
          .update({
            status: 'failed',
            last_error: `Failed after ${MAX_ATTEMPTS} attempts: ${message}`,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id)
        await handleFailedJob(supabase, job)
      }
    } catch (updateErr) {
      console.error(`[${WORKER_ID}] Failed to update job ${job.id} status:`, updateErr)
    }
  }
}

async function main() {
  const supabase = createSupabaseClient()
  console.log(`[${WORKER_ID}] Starting managed worker, polling every ${POLL_INTERVAL_MS}ms`)

  // Initialize system Claude credential at startup (reads from Supabase first, then env var)
  if (await initCredentials()) {
    await ensureValidToken()
  }

  let consecutiveErrors = 0

  while (true) {
    try {
      await reapStaleJobs(supabase)

      const job = await pollForJobs(supabase)

      // Successful DB round-trip — reset backoff
      consecutiveErrors = 0

      if (job) {
        // Refresh OAuth token before each job — access tokens expire after ~8h
        await ensureValidToken()
        await processJob(supabase, job)
      } else {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
    } catch (err) {
      consecutiveErrors++
      const backoff = Math.min(POLL_INTERVAL_MS * 2 ** (consecutiveErrors - 1), MAX_BACKOFF_MS)
      console.error(
        `[${WORKER_ID}] Poll loop error (${consecutiveErrors} consecutive, retrying in ${backoff}ms):`,
        err instanceof Error ? err.message : err,
      )
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
}

main().catch((err) => {
  console.error('Worker crashed:', err)
  process.exit(1)
})
