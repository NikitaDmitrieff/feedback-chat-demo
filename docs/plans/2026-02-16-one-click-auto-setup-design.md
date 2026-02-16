# One-Click Auto-Setup Design

**Goal:** Let users drop a GitHub repo URL in the dashboard and have the feedback widget fully installed — routes, components, Tailwind config, labels, webhook, and a hosted agent — with no manual deployment.

**Approach:** GitHub App (repo access + events) + headless Claude Code (intelligent code generation) + multi-tenant hosted agent (no per-user deployment).

**User experience:** Create project → install GitHub App → watch a live wizard → merge PR → add API key → done.

---

## Architecture

```
Dashboard                           GitHub                    Worker
   │                                  │                         │
   │  1. User enters repo URL         │                         │
   │  2. "Connect GitHub" button      │                         │
   │──── GitHub App install flow ────>│                         │
   │<─── installation_id + token ─────│                         │
   │                                  │                         │
   │  3. Wizard starts (live progress)│                         │
   │──── POST /api/setup/[projectId] ─────────────────────────>│
   │                                  │                         │
   │  4. Worker:                      │                         │
   │     a. Clone repo via install token                        │
   │     b. Analyze project structure                           │
   │     c. Run Claude Code headlessly                          │
   │     d. Commit to feedback-chat/setup branch                │
   │     e. Open PR ──────────────────>│                        │
   │     f. Create 6 labels ─────────>│                         │
   │                                  │                         │
   │<─── SSE progress updates ────────────────────────────────│
   │                                  │                         │
   │  5. Wizard: "PR ready! Merge to activate."                │
   │                                  │                         │
   │  ─── Later: issues events ──────>│ (via App webhook)       │
   │  ─── Agent picks up job ──────────────────────────────────>│
   │  ─── Agent runs Claude Code, creates PR ──────────────────>│
```

### Key insight

With a GitHub App, per-repo webhooks are unnecessary. The App receives all events from installed repos at a single endpoint. The dashboard routes events to the right project by matching `payload.repository.full_name` against `projects.github_repo`.

### Three new pieces of infrastructure

1. **GitHub App** — registered once, users install it on their repo
2. **Setup Worker** — clones repo, runs Claude Code, creates PR
3. **Agent Worker** — polls `job_queue`, executes Claude Code in Docker containers (70% already built: `job_queue` table + `claim_job` RPC + webhook endpoint exist)

---

## GitHub App

### Registration (one-time, manual)

- App name: `feedback-chat-bot`
- Homepage: dashboard URL
- Callback URL: `{DASHBOARD_URL}/auth/github-app/callback`
- Setup URL: `{DASHBOARD_URL}/auth/github-app/setup` (post-installation redirect)
- Webhook URL: `{DASHBOARD_URL}/api/github-app/webhook`
- Webhook secret: generated once, stored in dashboard env

### Permissions

| Permission | Access | Why |
|---|---|---|
| Contents | Read & Write | Clone repo, commit setup files, create branches |
| Pull requests | Read & Write | Open setup PR, open agent PRs |
| Issues | Read & Write | Create issues from widget, label management |
| Metadata | Read | Required by GitHub for all apps |

### Events subscribed

- `issues` — triggers agent pipeline
- `issue_comment` — detects retry requests
- `pull_request` — tracks PR merge for setup completion

### Token flow

- Installation access tokens: short-lived (~1hr), refreshed on demand
- Dashboard generates a JWT from the App private key, exchanges it for an installation token via `POST /app/installations/{id}/access_tokens`
- Only `github_installation_id` is stored in the DB (on `projects` table)

### Dashboard env vars (new)

```
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_APP_WEBHOOK_SECRET=hex-string
GITHUB_APP_CLIENT_ID=Iv1.abc123
GITHUB_APP_CLIENT_SECRET=secret123
```

---

## Database Changes

```sql
-- Add to projects table
ALTER TABLE projects
  ADD COLUMN github_installation_id bigint,
  ADD COLUMN setup_status text NOT NULL DEFAULT 'pending'
    CHECK (setup_status IN (
      'pending', 'installing', 'cloning', 'generating',
      'committing', 'pr_created', 'complete', 'failed'
    )),
  ADD COLUMN setup_pr_url text,
  ADD COLUMN setup_error text;

-- webhook_secret no longer required (GitHub App handles events)
ALTER TABLE projects ALTER COLUMN webhook_secret DROP NOT NULL;

-- Setup jobs (separate from agent job_queue)
CREATE TABLE setup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'cloning', 'generating', 'committing',
      'pr_created', 'done', 'failed'
    )),
  log text[],
  error text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
```

The existing `job_queue` + `pipeline_runs` + `run_logs` tables stay unchanged — they handle agent pipeline jobs. `setup_jobs` is a separate workflow.

---

## Setup Orchestrator

New API route: `POST /api/setup/[projectId]/route.ts`

Returns an SSE stream for live wizard progress.

### Worker steps

**1. CLONE**
- Get installation token (App JWT → `POST /app/installations/{id}/access_tokens`)
- `git clone https://x-access-token:{token}@github.com/{owner}/{repo}.git`
- Stream: "Cloning repository..."

**2. ANALYZE**
- Detect: `app/` vs `src/app/`, Tailwind v3 vs v4, React version, globals.css path
- Stream: "Analyzing project structure..."

**3. GENERATE (Claude Code headless)**
- Decrypt user's Claude credentials from `credentials` table
- Set `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`)
- Run Claude Code CLI with the setup prompt (adapted from `generateClaudePrompt()`)
- Working directory: the cloned repo
- Stream: "Generating setup files with Claude Code..."
- Timeout: 120s

**4. COMMIT**
- `git checkout -b feedback-chat/setup`
- `git add` the generated files
- `git commit -m "feat: add feedback-chat widget"`
- `git push` via installation token
- Stream: "Pushing changes..."

**5. PR**
- `POST /repos/{owner}/{repo}/pulls` via installation token
- Title: "Add feedback-chat widget"
- Body: checklist of what was added + `.env.local` template + "after merging" instructions
- Stream: "Creating pull request..."

**6. LABELS**
- Create 6 labels via GitHub API (idempotent — skip existing)
- Stream: "Creating GitHub labels..."

**7. DONE**
- Update `projects.setup_status = 'complete'`, `projects.setup_pr_url = PR URL`
- Stream: "Setup complete! PR ready for review."

### What the user still does manually after merging

- Add `ANTHROPIC_API_KEY` to `.env.local`
- Add `FEEDBACK_PASSWORD` to `.env.local` (defaults to `easy`)
- Restart dev server

These are mentioned in the PR body.

---

## Multi-tenant Agent Worker

### What already exists

- `job_queue` table with `claim_job` RPC (atomic lock via `SELECT FOR UPDATE SKIP LOCKED`) ✅
- `pipeline_runs` + `run_logs` tables ✅
- Webhook endpoint (`POST /api/webhook/[projectId]`) that enqueues jobs ✅
- `credentials` table with encrypted Claude keys ✅

### What's missing: a worker process

The worker runs as a long-lived process (separate from Next.js):

```
while true:
  1. Call claim_job() RPC
  2. If no job → sleep 5s → continue
  3. Fetch project credentials + github_installation_id
  4. Get installation token
  5. Clone repo via installation token
  6. Decrypt Claude credentials
  7. Run Claude Code CLI in Docker container:
     - Mount cloned repo
     - Set CLAUDE_CODE_OAUTH_TOKEN
     - Set --dangerously-skip-permissions
     - Feed issue body as prompt
  8. Build validation → lint validation → auto-fix loop (2 rounds)
  9. Create branch feedback/issue-{N} → push → open PR
  10. Update pipeline_runs.stage throughout
  11. Stream logs to run_logs table
```

### Execution isolation

Each job runs in a Docker container (based on `packages/agent/Dockerfile`). Container is destroyed after completion.

### Deployment

The worker runs alongside the dashboard — either as a separate process on the same server, or as a separate Railway service sharing the same Supabase database.

### Migration from standalone agent

With the GitHub App handling events, the standalone agent (`packages/agent/`) becomes optional. Projects using the GitHub App get the hosted multi-tenant agent automatically. Projects without the App can still use the standalone agent (backward compatible).

---

## Wizard UI

Replaces the current `SetupChecklist` when a GitHub App installation is detected. The old checklist stays as a "Manual setup" fallback.

### States

1. **Not connected** — "Connect GitHub" button → GitHub App install OAuth flow
2. **Connected, not set up** — "Set up my repo" button
3. **Setting up** — Live progress with animated stages:
   - Cloning repository...
   - Analyzing project structure...
   - Generating setup files...
   - Pushing changes...
   - Creating pull request...
   - Creating labels...
   Each stage: spinner → checkmark transition
4. **PR created** — PR link, "Merge to activate" CTA, env var reminder card
5. **Complete** — Green checkmark, "Widget is live"

### Progress mechanism

SSE stream from `POST /api/setup/[projectId]`. Each event:
```
data: {"stage": "cloning", "message": "Cloning repository..."}
data: {"stage": "generating", "message": "Generating setup files with Claude Code..."}
data: {"stage": "complete", "pr_url": "https://github.com/..."}
```

### Fallback

The existing Claude Code prompt copy/paste flow stays as a collapsible "Manual setup" section for users who prefer not to install a GitHub App.

---

## GitHub App Webhook Handler

New API route: `POST /api/github-app/webhook/route.ts`

Replaces per-repo webhooks. Single endpoint for all installed repos.

```
1. Verify webhook signature (GITHUB_APP_WEBHOOK_SECRET)
2. Parse event type + payload
3. Match payload.repository.full_name → projects.github_repo
4. If issues event → same logic as existing /api/webhook/[projectId] (enqueue job)
5. If issue_comment event → detect retry requests
6. If pull_request.merged event on feedback-chat/setup branch → mark setup complete
```

---

## Security

| Concern | Mitigation |
|---|---|
| GitHub App private key | Stored in env var, never exposed to client |
| Installation tokens | Short-lived (1hr), refreshed on demand, never in DB |
| User's Claude credentials | Encrypted in `credentials` table, decrypted only in worker |
| Repo access | Scoped to repos user explicitly installs the App on |
| Agent execution | Docker container sandbox, destroyed after job |
| PAT elimination | GitHub App replaces user-managed PATs entirely |

### Token cost

Zero for Claude Max subscribers (OAuth credentials). API key users pay per token as before.

---

## What changes for existing features

| Feature | Before | After |
|---|---|---|
| Webhook setup | User creates manually per repo | GitHub App receives events automatically |
| Label creation | User runs `gh label create` commands | Dashboard creates via GitHub API |
| Widget installation | User copies Claude Code prompt, runs locally | Dashboard generates PR automatically |
| Agent deployment | User deploys standalone agent on Railway/Docker | Multi-tenant hosted agent, zero deployment |
| GitHub auth | User provides PAT (`ghp_` prefix) | GitHub App installation token |

### Backward compatibility

- Projects without GitHub App installation keep working (manual setup + standalone agent)
- The old `SetupChecklist` stays as "Manual setup" fallback
- The existing `/api/webhook/[projectId]` endpoint stays for standalone agent users
- `webhook_secret` becomes nullable but still works for manual webhook configs
