# Self-Improvement Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When agent runs fail on consumer repos, automatically classify the failure and spawn a self-improvement job that creates a PR on the feedback-chat repo itself.

**Architecture:** New `classifyFailure()` function in the agent calls Haiku to categorize failures, then inserts a `self_improve` job into the existing `job_queue`. The managed-worker gains a new execution path that clones feedback-chat (instead of the consumer repo), runs Claude CLI with the failure analysis, validates, and creates a PR.

**Tech Stack:** Anthropic SDK (Haiku), Supabase (existing schema + migration), existing managed-worker infrastructure, GitHub API for PR creation.

**Design doc:** `docs/plans/2026-02-19-self-improvement-pipeline-design.md`

---

### Task 1: Supabase Migration — Add failure tracking and self-improvement columns

**Files:**
- Create: `packages/dashboard/supabase/migrations/00009_self_improvement.sql`

**Step 1: Write the migration**

```sql
-- Self-improvement pipeline: failure classification + improvement job tracking

-- Track failure analysis on pipeline_runs
ALTER TABLE feedback_chat.pipeline_runs
  ADD COLUMN IF NOT EXISTS failure_category text,
  ADD COLUMN IF NOT EXISTS failure_analysis text,
  ADD COLUMN IF NOT EXISTS improvement_job_id uuid REFERENCES feedback_chat.job_queue(id);

-- Link improvement jobs back to the failed run that triggered them
ALTER TABLE feedback_chat.job_queue
  ADD COLUMN IF NOT EXISTS source_run_id uuid REFERENCES feedback_chat.pipeline_runs(id);

-- Index for finding runs with failure analysis
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_failure
  ON feedback_chat.pipeline_runs(failure_category) WHERE failure_category IS NOT NULL;
```

**Step 2: Apply the migration to Supabase**

Run: `cd packages/dashboard && npx supabase db push --db-url "postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"`

Or apply manually via Supabase SQL editor at https://supabase.com/dashboard/project/lilcfbtohnhegxmpcfpb/sql

**Step 3: Commit**

```bash
git add packages/dashboard/supabase/migrations/00009_self_improvement.sql
git commit -m "feat(db): add self-improvement columns to pipeline_runs and job_queue"
```

---

### Task 2: Add Anthropic SDK to agent package

**Files:**
- Modify: `packages/agent/package.json`

**Step 1: Install the Anthropic SDK**

Run: `cd packages/agent && npm install @anthropic-ai/sdk`

**Step 2: Verify it installed correctly**

Run: `cd packages/agent && npm ls @anthropic-ai/sdk`
Expected: Shows the installed version without errors.

**Step 3: Commit**

```bash
git add packages/agent/package.json package-lock.json
git commit -m "feat(agent): add @anthropic-ai/sdk for failure classification"
```

---

### Task 3: Create the failure classifier module

**Files:**
- Create: `packages/agent/src/classify-failure.ts`
- Create: `packages/agent/src/classify-failure.test.ts`

**Step 1: Write the failing test**

Create `packages/agent/src/classify-failure.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { classifyFailure, type FailureClassification } from './classify-failure.js'

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({
            category: 'widget_bug',
            analysis: 'The widget CSS import path is wrong, causing the build to fail on Tailwind scanning.',
            fix_summary: 'Fix the CSS import path in styles.css',
          })}],
        }),
      }
    },
  }
})

describe('classifyFailure', () => {
  it('returns a valid classification from log data', async () => {
    const result = await classifyFailure({
      logs: [
        { level: 'info', message: 'Starting job for issue #5' },
        { level: 'error', message: 'Build failed: Cannot find module @nikitadmitrieff/feedback-chat/styles.css' },
      ],
      lastError: 'Build still failing after 2 fix attempts',
      issueBody: 'Please add a dark mode toggle',
      jobType: 'implement',
    })

    expect(result).toBeDefined()
    expect(result!.category).toBe('widget_bug')
    expect(result!.analysis).toContain('CSS')
    expect(result!.fix_summary).toBeDefined()
  })

  it('returns null for empty logs', async () => {
    const result = await classifyFailure({
      logs: [],
      lastError: '',
      issueBody: '',
      jobType: 'implement',
    })

    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/agent && npx vitest run src/classify-failure.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `packages/agent/src/classify-failure.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'

export type FailureCategory = 'docs_gap' | 'widget_bug' | 'agent_bug' | 'consumer_error' | 'transient'

export type FailureClassification = {
  category: FailureCategory
  analysis: string
  fix_summary: string
}

type LogEntry = { level: string; message: string }

interface ClassifyInput {
  logs: LogEntry[]
  lastError: string
  issueBody: string
  jobType: string
}

const VALID_CATEGORIES: FailureCategory[] = ['docs_gap', 'widget_bug', 'agent_bug', 'consumer_error', 'transient']

export async function classifyFailure(input: ClassifyInput): Promise<FailureClassification | null> {
  const { logs, lastError, issueBody, jobType } = input

  if (logs.length === 0 && !lastError) return null

  const logText = logs
    .map((l) => `[${l.level}] ${l.message}`)
    .join('\n')

  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are analyzing a failed agent run. The agent tried to implement a feature on a consumer's Next.js repo using the @nikitadmitrieff/feedback-chat widget.

Classify this failure into ONE of these categories:
- **docs_gap**: The failure happened because CLAUDE.md, installation instructions, or gotchas in the feedback-chat repo are incomplete or wrong. The agent didn't know how to handle a situation that should have been documented.
- **widget_bug**: The failure happened because the widget's source code (packages/widget/) has a bug — wrong exports, broken CSS, incompatible patterns, etc.
- **agent_bug**: The failure happened because the agent's own workflow logic (packages/agent/) is broken — cloning issues, validation logic, prompt construction, etc.
- **consumer_error**: The failure is the consumer's fault — bad config, missing env vars, incompatible dependencies, unusual project structure that we shouldn't need to support.
- **transient**: Network timeout, rate limit, flaky CI, GitHub API outage, or other temporary issue.

Job type: ${jobType}

Original issue body:
${issueBody.slice(0, 1000)}

Last error:
${lastError.slice(0, 1000)}

Run logs (last entries):
${logText.slice(-3000)}

Respond with ONLY a JSON object (no markdown, no code fences):
{"category": "one_of_the_five", "analysis": "One paragraph explaining what went wrong and why this category.", "fix_summary": "One sentence: what should be changed in the feedback-chat repo to prevent this. Use 'N/A' for consumer_error and transient."}`,
      },
    ],
  })

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text)

    if (!VALID_CATEGORIES.includes(parsed.category)) return null

    return {
      category: parsed.category,
      analysis: String(parsed.analysis || ''),
      fix_summary: String(parsed.fix_summary || ''),
    }
  } catch {
    console.error('[classify] Failed to parse Haiku response')
    return null
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/agent && npx vitest run src/classify-failure.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/agent/src/classify-failure.ts packages/agent/src/classify-failure.test.ts
git commit -m "feat(agent): add failure classifier using Haiku"
```

---

### Task 4: Create the self-improvement worker module

**Files:**
- Create: `packages/agent/src/self-improve-worker.ts`

**Step 1: Write the self-improvement execution logic**

This module handles the `self_improve` job type — cloning feedback-chat, running Claude CLI with the failure context, validating, and creating a PR.

Create `packages/agent/src/self-improve-worker.ts`:

```ts
import { execSync, execFileSync } from 'node:child_process'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ensureValidToken } from './oauth.js'
import { DbLogger } from './logger.js'
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>

const FEEDBACK_CHAT_REPO = 'NikitaDmitrieff/feedback-chat'
const STEP_TIMEOUT_MS = 5 * 60 * 1000
const CLAUDE_TIMEOUT_MS = 10 * 60 * 1000

export interface SelfImproveInput {
  jobId: string
  sourceRunId: string
  failureCategory: string
  failureAnalysis: string
  fixSummary: string
  originalIssueBody: string
  logExcerpts: string
  supabase: AnySupabaseClient
}

function run(cmd: string, cwd: string, timeoutMs = STEP_TIMEOUT_MS): string {
  try {
    return execSync(cmd, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    })
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; status?: number }
    const details = `Exit ${e.status}\nSTDERR: ${(e.stderr || '').slice(-2000)}\nSTDOUT: ${(e.stdout || '').slice(-2000)}`
    throw new Error(`Command failed: ${cmd}\n${details}`)
  }
}

async function claudeEnv(): Promise<NodeJS.ProcessEnv> {
  if (process.env.CLAUDE_CREDENTIALS_JSON) {
    const ok = await ensureValidToken()
    if (!ok) {
      const { CLAUDECODE: _cc, ...rest } = process.env
      return { ...rest, CI: 'true' }
    }
    try {
      const credsPath = join(homedir(), '.claude', '.credentials.json')
      const creds = JSON.parse(readFileSync(credsPath, 'utf-8'))
      const accessToken = creds?.claudeAiOauth?.accessToken
      if (accessToken) {
        const { ANTHROPIC_API_KEY: _, ...rest } = process.env
        const { CLAUDECODE: _cc, ...rest2 } = rest
        return { ...rest2, CLAUDE_CODE_OAUTH_TOKEN: accessToken, CI: 'true' }
      }
    } catch {}
  }
  const { CLAUDECODE: _cc, ...rest } = process.env
  return { ...rest, CI: 'true' }
}

function buildPrompt(input: SelfImproveInput): string {
  const scopeInstructions: Record<string, string> = {
    docs_gap: `Focus on updating documentation:
- CLAUDE.md (installation steps, gotchas, key patterns)
- Setup prompts in packages/agent/src/setup-worker.ts (the buildSetupPrompt function)
- Any README files that reference installation

Do NOT change source code unless the docs reference incorrect API/exports.`,

    widget_bug: `Focus on fixing widget source code in packages/widget/:
- Check exports in packages/widget/package.json and packages/widget/src/
- Check CSS in packages/widget/src/client/styles.css
- Check React components in packages/widget/src/client/
- Check server handlers in packages/widget/src/server/

Run \`npm run build\` from the repo root to verify the fix compiles.`,

    agent_bug: `Focus on fixing agent logic in packages/agent/:
- Check managed-worker.ts (job processing, retry logic)
- Check worker.ts (job execution, validation, Claude CLI invocation)
- Check setup-worker.ts (setup job flow)
- Check github.ts (GitHub API calls)

Run \`npm run build\` from the repo root to verify the fix compiles.`,
  }

  return `You are fixing the feedback-chat repository (https://github.com/NikitaDmitrieff/feedback-chat) based on a failure analysis.

## Failure Category: ${input.failureCategory}

## Failure Analysis
${input.failureAnalysis}

## Suggested Fix
${input.fixSummary}

## Original Issue That Triggered the Failed Run
${input.originalIssueBody.slice(0, 1000)}

## Error Logs From the Failed Run
${input.logExcerpts.slice(-3000)}

## Scope Instructions
${scopeInstructions[input.failureCategory] || 'Analyze the failure and make the minimal fix needed.'}

## Rules
- Make the MINIMAL change needed to prevent this specific failure from recurring
- Do NOT refactor unrelated code
- Do NOT add features
- Do NOT change test infrastructure
- If the fix requires changing multiple files, that's fine, but each change should be directly related to the failure
- Run \`npm run build\` to verify your changes compile`
}

export async function runSelfImproveJob(input: SelfImproveInput): Promise<{ prUrl: string | null }> {
  const { jobId, sourceRunId, failureCategory, supabase } = input
  const shortHash = sourceRunId.slice(0, 8)
  const branch = `fix/${failureCategory}-${shortHash}`
  const workDir = `/tmp/self-improve-${shortHash}`
  const logger = new DbLogger(supabase, sourceRunId)

  try {
    // 1. Clone feedback-chat
    await logger.log(`[self-improve] Cloning ${FEEDBACK_CHAT_REPO}...`)
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true })

    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error('GITHUB_TOKEN required for self-improvement jobs')

    run(`git clone --depth=1 https://x-access-token:${token}@github.com/${FEEDBACK_CHAT_REPO}.git ${workDir}`, '/tmp')
    run('npm install', workDir)

    // 2. Run Claude CLI with failure context
    await logger.log(`[self-improve] Running Claude CLI (category: ${failureCategory})...`)
    const prompt = buildPrompt(input)
    const env = await claudeEnv()

    execFileSync('claude', ['--dangerously-skip-permissions', '-p', prompt], {
      cwd: workDir,
      timeout: CLAUDE_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    })

    // 3. Validate
    await logger.log('[self-improve] Validating (build + test)...')
    run('npm run build', workDir)

    // Run tests but don't fail on test errors — some tests may need env vars not available
    try {
      run('npm run test', workDir)
      await logger.log('[self-improve] Tests passed')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await logger.warn(`[self-improve] Tests had issues (proceeding): ${msg.slice(0, 500)}`)
    }

    // 4. Check if there are changes
    const diff = run('git diff --stat', workDir).trim()
    const untracked = run('git ls-files --others --exclude-standard', workDir).trim()
    if (!diff && !untracked) {
      await logger.warn('[self-improve] No changes generated — Claude did not modify any files')
      return { prUrl: null }
    }

    // 5. Branch, commit, push
    await logger.log(`[self-improve] Pushing branch ${branch}...`)
    run(`git checkout -b ${branch}`, workDir)
    run('git add -A', workDir)
    execFileSync(
      'git',
      ['commit', '-m', `fix(${failureCategory}): auto-fix from failed run ${shortHash}\n\nTriggered by failure analysis of run ${sourceRunId}.`],
      { cwd: workDir, timeout: STEP_TIMEOUT_MS, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    run(`git push -u origin ${branch}`, workDir)

    // 6. Create PR
    await logger.log('[self-improve] Creating PR...')
    const prBody = `## Self-Improvement Fix

**Category:** \`${failureCategory}\`
**Source run:** ${sourceRunId}

### Failure Analysis
${input.failureAnalysis}

### Suggested Fix
${input.fixSummary}

---
*Auto-generated by the self-improvement pipeline.*`

    const prTitle = `fix(${failureCategory}): ${input.fixSummary.slice(0, 60)}`

    const res = await fetch(`https://api.github.com/repos/${FEEDBACK_CHAT_REPO}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: prTitle,
        body: prBody,
        head: branch,
        base: 'main',
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`PR creation failed: ${res.status} ${text}`)
    }

    const prData = await res.json()
    await logger.log(`[self-improve] PR created: ${prData.html_url}`)

    return { prUrl: prData.html_url }
  } finally {
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true })
  }
}
```

**Step 2: Verify it compiles**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/agent/src/self-improve-worker.ts
git commit -m "feat(agent): add self-improvement worker execution path"
```

---

### Task 5: Wire classification + self-improvement into managed-worker

**Files:**
- Modify: `packages/agent/src/managed-worker.ts:189-232` (the catch block in `processJob`)
- Modify: `packages/agent/src/managed-worker.ts:123-183` (the `processJob` function — add `self_improve` dispatch)

**Step 1: Add imports to managed-worker.ts**

At the top of `packages/agent/src/managed-worker.ts`, add after the existing imports:

```ts
import { classifyFailure } from './classify-failure.js'
import { runSelfImproveJob } from './self-improve-worker.js'
```

**Step 2: Add the self_improve job dispatch in processJob**

In `processJob`, inside the `try` block, add a new `else if` clause after the `setup` check (around line 167). The modified dispatch section should be:

```ts
    // Dispatch based on job type
    if (job.job_type === 'setup') {
      // ... existing setup code unchanged ...
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
      // ... existing code unchanged ...
    }
```

**Step 3: Add failure classification + self_improve job spawn in the catch block**

In `processJob`, modify the catch block's failure paths. After marking a job as `failed` (both the OAuth permanent failure and the exhausted-retries paths), add the classification logic. Only classify non-`self_improve` jobs (recursion guard).

Add this helper function above `processJob`:

```ts
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
        .map((l) => `[${l.level}] ${l.message}`)
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
```

Then in the catch block, call `handleFailedJob` after marking the job as failed. Add it in both the OAuth-error path and the exhausted-retries path:

After `console.log(... Reaped stale job ... → failed ...)` and after the `status: 'failed'` update in the exhausted-retries block:

```ts
await handleFailedJob(supabase, job)
```

**Step 4: Add `source_run_id` to the job type in processJob signature**

Update the job type in `processJob` to include the new field:

```ts
async function processJob(supabase: Supabase, job: {
  id: string
  project_id: string
  job_type?: string
  attempt_count?: number
  github_issue_number: number
  issue_title: string
  issue_body: string
  source_run_id?: string  // ← add this
}) {
```

**Step 5: Verify it compiles**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: No errors.

**Step 6: Commit**

```bash
git add packages/agent/src/managed-worker.ts
git commit -m "feat(agent): wire failure classification and self-improvement into managed-worker"
```

---

### Task 6: Add ANTHROPIC_API_KEY support for Haiku classification

**Files:**
- Modify: `packages/agent/src/classify-failure.ts` (ensure it can use the API key from env)

The Anthropic SDK automatically reads `ANTHROPIC_API_KEY` from the environment, so `new Anthropic()` already works if the env var is set. However, the agent currently uses OAuth (not API key). We need to make the classifier work with the OAuth token too.

**Step 1: Update the classifier to pass the API key explicitly**

In `classify-failure.ts`, update the client initialization to support both auth methods:

```ts
function getAnthropicClient(): Anthropic {
  // If we have an API key, use it directly (cheapest path for classification)
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  // Otherwise, try reading the OAuth access token
  try {
    const credsPath = join(homedir(), '.claude', '.credentials.json')
    const creds = JSON.parse(readFileSync(credsPath, 'utf-8'))
    const accessToken = creds?.claudeAiOauth?.accessToken
    if (accessToken) {
      return new Anthropic({ apiKey: accessToken })
    }
  } catch {}

  // Fallback: let the SDK try default env vars
  return new Anthropic()
}
```

Add the required imports at the top:

```ts
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
```

Replace `const client = new Anthropic()` with `const client = getAnthropicClient()`.

**Step 2: Verify it compiles**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: No errors.

**Step 3: Run existing tests**

Run: `cd packages/agent && npx vitest run`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add packages/agent/src/classify-failure.ts
git commit -m "feat(agent): support OAuth token for Haiku classification"
```

---

### Task 7: Dashboard — Show failure analysis on run detail page

**Files:**
- Modify: `packages/dashboard/src/app/projects/[id]/runs/[runId]/page.tsx`

**Step 1: Update the run query to include new columns**

In `page.tsx`, update the `select` for the run query (around line 28):

```ts
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('id, github_issue_number, github_pr_number, stage, triggered_by, started_at, completed_at, result, failure_category, failure_analysis, improvement_job_id')
    .eq('id', runId)
    .eq('project_id', projectId)
    .single()
```

**Step 2: Add the Failure Analysis card to the sidebar**

After the "Original Feedback" card section (around line 198), add:

```tsx
          {/* Failure Analysis */}
          {run.failure_category && (
            <div className="glass-card p-5">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Failure Analysis</h3>
              <div className="mb-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  run.failure_category === 'consumer_error' ? 'bg-warning/20 text-warning' :
                  run.failure_category === 'transient' ? 'bg-muted/20 text-muted' :
                  'bg-danger/20 text-danger'
                }`}>
                  {run.failure_category.replace('_', ' ')}
                </span>
              </div>
              {run.failure_analysis && (
                <p className="text-xs text-muted leading-relaxed">{run.failure_analysis}</p>
              )}
              {run.improvement_job_id && (
                <p className="mt-2 text-xs text-accent">
                  Improvement job spawned
                </p>
              )}
            </div>
          )}
```

**Step 3: Verify the dashboard builds**

Run: `cd packages/dashboard && npm run build`
Expected: Build succeeds (may warn about unused vars — that's OK).

**Step 4: Commit**

```bash
git add packages/dashboard/src/app/projects/[id]/runs/[runId]/page.tsx
git commit -m "feat(dashboard): show failure analysis card on run detail page"
```

---

### Task 8: Build, test, and final verification

**Files:**
- No new files — verification only.

**Step 1: Build the full monorepo**

Run: `npm run build`
Expected: All packages build successfully.

**Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass.

**Step 3: Review the full changeset**

Run: `git log --oneline main..HEAD`
Expected: Should show ~7 commits covering migration, SDK install, classifier, self-improve worker, managed-worker wiring, auth support, and dashboard.

**Step 4: Verify the migration file is correct SQL**

Read `packages/dashboard/supabase/migrations/00009_self_improvement.sql` and confirm it references the correct schema (`feedback_chat`) and tables.

---

### Task 9: Update CLAUDE.md with self-improvement pipeline docs

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add self-improvement section**

Add to the Agent (Railway) section in CLAUDE.md:

```markdown
- **Self-improvement:** when runs fail, the agent classifies the failure with Haiku (categories: `docs_gap`, `widget_bug`, `agent_bug`, `consumer_error`, `transient`). For our-fault failures, it spawns a `self_improve` job that clones feedback-chat, runs Claude CLI with the failure context, and creates a PR. Self-improvement jobs never recursively spawn more self-improvement jobs.
- **New columns:** `pipeline_runs.failure_category`, `pipeline_runs.failure_analysis`, `pipeline_runs.improvement_job_id`; `job_queue.source_run_id`
```

**Step 2: Add to Gotchas section**

```markdown
- `self_improve` jobs use `GITHUB_TOKEN` (not installation tokens) to push to `NikitaDmitrieff/feedback-chat` — the GitHub App may not have access to the feedback-chat repo itself
- Self-improvement jobs that fail do NOT spawn further self-improvement jobs (hard recursion guard)
- The Haiku classification requires either `ANTHROPIC_API_KEY` or a valid OAuth token — if both are missing, classification is silently skipped
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add self-improvement pipeline to CLAUDE.md"
```
