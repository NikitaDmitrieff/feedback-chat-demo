# Agent Deployment

The agent service lives in `packages/agent/`. It's a managed worker that polls a Supabase job queue for work and uses Claude Code CLI to implement feedback.

## Architecture

There are two modes:

- **Managed mode** (`managed-worker.js`, default): Polls Supabase `job_queue` table every 5 seconds. Used with the dashboard — webhooks go to the dashboard, which enqueues jobs.
- **Standalone mode** (`server.js`): Fastify server that receives GitHub webhooks directly. For setups without the dashboard.

```
Dashboard webhook (issue opened/reopened/labeled with auto-implement)
  → Verify HMAC-SHA256 signature
  → Check labels (needs 'feedback-bot')
  → Insert into Supabase job_queue
  → Managed worker polls and claims job
  → Process:
      1. Parse issue body (extract prompt)
      2. Clone repo (shallow)
      3. Install dependencies
      4. Run Claude Code CLI with prompt
      5. Build + lint validation
      6. Auto-fix loop (up to 2 attempts)
      7. Create branch + PR
      8. Mark as preview-pending
```

## Dockerfile

The agent ships with a **multi-stage Dockerfile** that handles everything:

```
Builder stage (node:22-slim):
  - npm install (dev deps for compilation)
  - tsc (compile TypeScript)

Runtime stage (node:22-slim):
  - apt-get install git, curl, ca-certificates
  - npm install -g @anthropic-ai/claude-code
  - useradd agent (non-root user)
  - npm install --production
  - COPY --from=builder dist/
  - chown -R agent:agent /app /tmp
  - USER agent
  - git config (for commits)
  - {"hasCompletedOnboarding": true} → ~/.claude.json
```

Key points:
- **No pre-built `dist/` required** — the builder stage compiles TypeScript
- **`git` must be installed** — the agent clones consumer repos at runtime
- **Non-root user is mandatory** — Claude Code CLI refuses `--dangerously-skip-permissions` as root
- **`hasCompletedOnboarding`** — required for `CLAUDE_CODE_OAUTH_TOKEN` to work in headless environments (see [anthropics/claude-code#8938](https://github.com/anthropics/claude-code/issues/8938))
- **`tsconfig.base.json`** — lives in `packages/agent/` alongside `tsconfig.json` (the Dockerfile copies both)

## Railway (recommended)

### Step-by-step

```bash
# 1. Clone and navigate to the agent
git clone https://github.com/NikitaDmitrieff/feedback-chat
cd feedback-chat/packages/agent

# 2. Install Railway CLI and login
npm install -g @railway/cli
railway login

# 3. Create project and do first deploy (creates the service)
railway init
railway up --detach

# 4. Link the service (required for variable management)
railway service status --all    # note the auto-generated service name
railway service link <name>     # e.g. railway service link amusing-communication

# 5. Set required env vars
railway variables set GITHUB_TOKEN=ghp_...
railway variables set GITHUB_REPO=owner/repo
railway variables set WEBHOOK_SECRET=$(openssl rand -hex 32)

# 6. Set Claude auth (choose one)
# Option A: Max subscription ($0/run)
railway variables set CLAUDE_CREDENTIALS_JSON='{"claudeAiOauth":{...}}'
# Option B: API key (pay per token)
railway variables set ANTHROPIC_API_KEY=sk-ant-...

# 7. Get public domain
railway domain    # save this URL

# 8. Verify
curl https://your-domain.railway.app/health
```

### Railway CLI gotchas

- `railway init` creates a project but doesn't create a service — the first `railway up` does
- You must `railway service link <name>` before `railway variables set` will work
- `railway service status --all` shows all services and their deploy status
- Railway auto-redeploys when env vars change — wait for SUCCESS before testing
- `railway domain` outputs decorated text (emoji + URL) — extract the clean URL with `grep -oE 'https://[^ ]+'`
- `railway service link` accepts either the service name (from `railway service status --all`) or the service ID (from `railway up --detach` output URL)
- Combine `railway variables set` calls into one command: `railway variables set KEY1=val1 KEY2=val2`

## Docker

```bash
cd packages/agent
docker build -t feedback-agent .
docker run -p 3000:3000 --env-file .env feedback-agent
```

Create `.env` with the required variables (see below).

## Environment variables

### Required

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub PAT (`ghp_` prefix) with `repo` + `workflow` scopes. **Not** `gho_` tokens (they expire after ~8h) |
| `GITHUB_REPO` | Target repository (`owner/name`) |
| `WEBHOOK_SECRET` | Random string for webhook HMAC verification |

### Authentication (choose one)

| Variable | Description |
|----------|-------------|
| `CLAUDE_CREDENTIALS_JSON` | Claude Max OAuth credentials (JSON string) — **$0/run** |
| `ANTHROPIC_API_KEY` | API key fallback — pay per token |

#### How Max OAuth works in the agent

The flow is:

1. At startup, `initCredentials()` writes `CLAUDE_CREDENTIALS_JSON` to `~/.claude/.credentials.json`
2. Before each job, `ensureValidToken()` checks if the token expires within 5 minutes
3. If expiring, it refreshes using the `refresh_token` grant against Anthropic's OAuth endpoint
4. `claudeEnv()` reads the refreshed access token and passes it as `CLAUDE_CODE_OAUTH_TOKEN` to the CLI
5. `ANTHROPIC_API_KEY` is stripped from the env so the CLI can't fall back to API billing

The `CLAUDE_CODE_OAUTH_TOKEN` env var is the only way to authenticate Claude Code CLI in headless Docker — the credentials file approach doesn't work because Docker containers lack system keychains (macOS Keychain, Linux libsecret).

**To get your credentials JSON** (on macOS with Claude Code installed):
```bash
cd packages/agent
npm run credentials
```

This extracts from the macOS keychain, validates the refresh token against Anthropic's OAuth endpoint, and prints a fresh JSON to stdout. Pipe-friendly: `npm run credentials 2>/dev/null | pbcopy`

> **Tokens expire.** If the agent fails with `authentication_error` or `invalid_grant`, re-run `npm run credentials` to get fresh tokens and redeploy.

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_INSTALL_CMD` | `npm ci` | Install command |
| `AGENT_BUILD_CMD` | `npm run build` | Build command |
| `AGENT_LINT_CMD` | `npm run lint` | Lint command |
| `AGENT_CLAUDE_TIMEOUT_MS` | `900000` (15 min) | Claude CLI timeout |
| `AGENT_JOB_BUDGET_MS` | `1500000` (25 min) | Total job time budget |
| `AGENT_ENV_FORWARD` | `NEXT_PUBLIC_*` | Comma-separated env var patterns to forward to cloned repo |
| `PORT` | `3000` | Fastify server port |

### Env forwarding patterns

`AGENT_ENV_FORWARD` supports glob patterns. The agent writes matching env vars to `.env.local` in the cloned repo:

```env
# Forward all NEXT_PUBLIC_ vars + a specific one
AGENT_ENV_FORWARD=NEXT_PUBLIC_*,DATABASE_URL
```

## GitHub webhook setup

Create a webhook on your consumer repo (not the feedback-chat repo):

1. Go to repo → **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL:** `https://your-agent.railway.app/webhook/github`
3. **Content type:** `application/json` (**critical** — `form-urlencoded` causes 415 errors)
4. **Secret:** same value as `WEBHOOK_SECRET`
5. **Events:** Select "Let me select individual events" → check **Issues** only (the handler accepts `opened`, `reopened`, and `labeled` actions — `labeled` allows re-triggering by toggling the `auto-implement` label)

Or via CLI (**note `config[content_type]=json`** — without it GitHub defaults to form-urlencoded):

```bash
gh api repos/OWNER/REPO/hooks \
  -f name=web -F active=true \
  -f "config[url]=https://your-agent.railway.app/webhook/github" \
  -f "config[content_type]=json" \
  -f "config[secret]=YOUR_WEBHOOK_SECRET" \
  -f 'events[]=issues'
```

## Health endpoint

**GET /health**

```json
{
  "status": "ok",
  "currentJob": 42,       // issue number or null
  "queueLength": 1
}
```

The widget's status handler polls this to determine the `running` stage.

## Job workflow detail

### 1. Parse issue

Extracts the generated prompt from `## Generated Prompt` code block. Also reads `<!-- agent-meta: {...} -->` for metadata (prompt type, visitor name).

### 2. Clone + install

Shallow clone via `git clone --depth=1` using the GitHub token. Runs the install command.

### 3. Pre-lint check

Runs lint before Claude to detect pre-existing errors. If there are failures, they're included in the Claude prompt as context.

### 4. Retry detection

Checks the 5 most recent issue comments for `**Modifications demandées :**` (posted by the "request changes" action). If found, appends the user's feedback to the prompt.

### 5. Claude Code CLI

Runs `claude --dangerously-skip-permissions -p '{prompt}'`. Uses `CLAUDE_CODE_OAUTH_TOKEN` if Max credentials are available, `ANTHROPIC_API_KEY` as fallback. The `CI=true` env var is always set to prevent interactive prompts.

### 6. Validation loop

After Claude finishes:
1. Run build command
2. If build fails → post error, mark `agent-failed`
3. If build succeeds → lint changed files
4. If lint fails → attempt auto-fix (up to 2 rounds):
   - Round 1: `eslint --fix` on changed files
   - Round 2: Ask Claude to fix the errors
5. If still failing after 2 rounds → mark `agent-failed`

### 7. Create PR

- Branch: `feedback/issue-{N}`
- Commit: `feat: {title} (auto-implemented from #{N})`
- Force-pushes to handle retries
- PR body includes `Closes #{N}`

### 8. Mark preview-pending

Removes `in-progress` label, adds `preview-pending`. Vercel (or your CI) deploys a preview from the PR branch automatically.

## OAuth token management

The agent automatically refreshes Claude Max OAuth tokens before each job:
- Reads from `~/.claude/.credentials.json`
- Checks if token expires within 5 minutes
- If expiring: calls Anthropic OAuth endpoint with refresh token
- Updates credentials file
- Passes refreshed token as `CLAUDE_CODE_OAUTH_TOKEN` to the CLI env

Initial credentials come from `CLAUDE_CREDENTIALS_JSON` env var (JSON string from the Max OAuth flow).

## GitHub labels managed by the agent

| Label | Meaning |
|-------|---------|
| `feedback-bot` | Issue created by widget |
| `auto-implement` | Agent should process this |
| `in-progress` | Agent is currently working |
| `agent-failed` | Build/lint/validation failed |
| `preview-pending` | PR ready, awaiting preview deployment |
| `rejected` | User rejected changes |
