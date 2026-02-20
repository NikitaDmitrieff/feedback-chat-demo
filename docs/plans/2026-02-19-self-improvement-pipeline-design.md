# Self-Improvement Pipeline Design

**Date:** 2026-02-19
**Status:** Approved

## Problem

When the agent runs on consumer repos (via dashboard + GitHub App), some runs fail. These failures often reveal gaps in the feedback-chat repo itself — unclear docs, widget bugs, or agent logic issues. Currently these failures are logged but not acted upon. We want failures to automatically improve the repo.

## Solution: Classify-Then-Fix Pipeline

When a run fails, classify the failure with Claude Haiku, then spawn an improvement job on the feedback-chat repo itself if the failure is our fault.

## Architecture

```
Failed run
    │
    ▼
┌──────────────────┐
│ classifyFailure() │  ← Haiku API call (cheap, fast)
│ Categories:       │
│  - docs_gap       │
│  - widget_bug     │
│  - agent_bug      │
│  - consumer_error │  ← no action
│  - transient      │  ← no action
└──────────────────┘
    │ (if our fault)
    ▼
┌──────────────────────────┐
│ Insert self_improve job   │
│ into job_queue            │
└──────────────────────────┘
    │
    ▼
┌──────────────────────────────┐
│ Agent claims & executes:     │
│ 1. Clone feedback-chat       │
│ 2. Claude CLI with analysis  │
│ 3. Validate (build + test)   │
│ 4. Create PR                 │
└──────────────────────────────┘
    │
    ▼
  PR on feedback-chat for review
```

## Section 1: Failure Classification

**Trigger:** When `managed-worker.ts` marks a job as `failed` (after 3 retries or permanent OAuth error).

**Process:**
1. Pull last 100 `run_logs` for the failed run + `job_queue.last_error`
2. Call Claude Haiku via Anthropic SDK (not CLI — cheaper, no full session needed)
3. Haiku classifies into one of 5 categories and returns a one-paragraph analysis
4. Store `failure_category` and `failure_analysis` on `pipeline_runs`

**Gate:** Only `docs_gap`, `widget_bug`, `agent_bug` proceed to improvement jobs. `consumer_error` and `transient` are logged but no job is created.

## Section 2: Job Creation & Execution

**New job type:** `self_improve` in `job_queue`

**Job payload includes:**
- `source_run_id` linking back to the failed pipeline_runs row
- Constructed issue_body with failure analysis, category, original issue body, and log excerpts

**Execution path:**
1. Clone `NikitaDmitrieff/feedback-chat` (not the consumer repo)
2. Create branch: `fix/<category>-<short-hash>`
3. Run Claude CLI with category-scoped instructions:
   - `docs_gap` → update CLAUDE.md, installation steps, gotchas
   - `widget_bug` → fix widget source in packages/widget/
   - `agent_bug` → fix agent logic in packages/agent/
4. Validate: `npm run build && npm run test`
5. If passes → push branch, create PR
6. If fails → log error, mark job failed

**Safety:** `self_improve` jobs that fail NEVER spawn another `self_improve` job. Hard recursion guard.

## Section 3: Schema Changes

**Migration on `pipeline_runs`:**
- `failure_category` text (nullable) — `docs_gap`, `widget_bug`, `agent_bug`, `consumer_error`, `transient`
- `failure_analysis` text (nullable) — Haiku's explanation
- `improvement_job_id` uuid (nullable) — FK to job_queue.id

**Migration on `job_queue`:**
- `source_run_id` uuid (nullable) — links back to triggering pipeline_runs row
- `job_type` already exists, `self_improve` is a new recognized value

**`claim_next_job` RPC:** No changes needed — already claims oldest pending job regardless of type.

## Section 4: PR Creation & Dashboard

**PR format:**
- Branch: `fix/<category>-<run_id_short>`
- Title: `fix(<category>): <one-line from failure_analysis>`
- Body: failure analysis + link to failed run + consumer context
- Labels: `self-improvement`, `<category>`

**Dashboard:**
- Run detail sidebar: "Failure Analysis" card with category badge and analysis text
- Link to improvement PR if one was spawned
- Runs list: filter for "has improvement PR"

## Key Decisions

- **Reuse existing agent** — no new infrastructure, `self_improve` is just another job type
- **Haiku classification gate** — avoids wasting agent runs on consumer errors or transient failures
- **PRs for review** — human in the loop, no auto-merge
- **No recursion** — `self_improve` failures are terminal
