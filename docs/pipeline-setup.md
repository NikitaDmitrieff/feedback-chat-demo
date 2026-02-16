# Tier 3: Full Pipeline (Agent)

Everything from [GitHub integration](./github-integration.md) plus an autonomous agent that implements the feedback as code. The full flow:

```
User submits idea in widget
  → AI refines it in chat
  → GitHub issue created
  → Agent clones repo, runs Claude Code CLI
  → Build + lint validation (with auto-fix retries)
  → PR opened
  → Vercel preview deployed
  → User approves/rejects/requests changes in widget
```

## What you get (on top of Tier 2)

- **PipelineTracker** in the widget: real-time progress through 6 stages
- Agent clones your repo, installs deps, runs Claude Code CLI to implement the change
- Build + lint validation with up to 2 auto-fix attempts
- PR created automatically with Vercel preview deployment
- Approve, reject, or request changes directly from the widget
- Request changes triggers a retry — agent reads your feedback and tries again

## Pipeline stages

```
created → queued → running → validating → preview_ready → deployed
                                                ↓
                                       approve / reject / request changes

failed (at any stage) / rejected (user chose to reject)
```

| Stage | Description |
|-------|-------------|
| `created` | Issue just created |
| `queued` | Waiting for agent (max 5 in queue) |
| `running` | Agent is cloning and running Claude Code CLI |
| `validating` | Build and lint checks running |
| `preview_ready` | Vercel preview deployed — user can approve/reject |
| `deployed` | PR merged, changes live |
| `failed` | Build/lint/validation failed |
| `rejected` | User rejected the changes |

## Setup

### 1. Widget side

Follow [GitHub integration setup](./github-integration.md), then add `AGENT_URL` to your status route:

```ts
import { createStatusHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createStatusHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  github: {
    token: process.env.GITHUB_TOKEN!,
    repo: process.env.GITHUB_REPO!,
  },
  agentUrl: process.env.AGENT_URL,
})

export const { GET, POST } = handler
```

Add to `.env.local`:

```env
AGENT_URL=https://your-agent.railway.app
```

### 2. Deploy the agent

See [Agent deployment guide](./agent-deployment.md) for Railway and Docker instructions.

### 3. Create GitHub webhook

In your GitHub repo settings, create a webhook:

- **URL:** `https://your-agent.railway.app/webhook/github`
- **Content type:** `application/json`
- **Secret:** same as `WEBHOOK_SECRET` env var on the agent
- **Events:** Issues only (handles `opened`, `reopened`, and `labeled` actions — toggling `auto-implement` re-triggers the pipeline)

## User actions in the widget

At the `preview_ready` stage, the widget shows:

- **Approve** — merges the PR (squash), closes the issue, deletes the feedback branch
- **Reject** — closes the PR, labels the issue as `rejected`, closes the issue
- **Request changes** — posts your comment on the issue, removes `preview-pending` label, adds `auto-implement` label, reopens the issue. The agent picks it up again and reads your feedback

At the `failed` stage:

- **Retry** — removes `agent-failed` and `in-progress` labels, reopens the issue for the agent to try again

## How Max OAuth works in the agent

When you set `CLAUDE_CREDENTIALS_JSON`, the agent:

1. Writes credentials to `~/.claude/.credentials.json` at startup
2. Refreshes the OAuth token before each job (if expiring within 5 min)
3. Reads the refreshed access token and passes it as `CLAUDE_CODE_OAUTH_TOKEN` to the CLI
4. Strips `ANTHROPIC_API_KEY` from the env so the CLI can't fall back to API billing

This is the only way to use Max OAuth in headless Docker — the credentials file approach doesn't work because containers lack system keychains. The Dockerfile also writes `{"hasCompletedOnboarding": true}` to `~/.claude.json` (required workaround for [anthropics/claude-code#8938](https://github.com/anthropics/claude-code/issues/8938)).

> **Tokens expire.** If the agent fails with `authentication_error` or `invalid_grant`, run `cd packages/agent && npm run credentials` to extract fresh tokens from your macOS keychain and redeploy.

## Cost

| Component | Cost | Auth method |
|-----------|------|-------------|
| Chat (Haiku) | ~$0.01/conversation | `ANTHROPIC_API_KEY` |
| Code agent | $0/implementation | Claude Max OAuth via `CLAUDE_CODE_OAUTH_TOKEN` |
| Railway | ~$5/month (sleeps when idle) | Railway token |
| Vercel previews | Free (hobby) or included in Pro | Existing Vercel setup |

**If you have Claude Max ($200/mo), you get unlimited feedback-to-code automation for the cost of a ~$5/mo Railway instance.**
