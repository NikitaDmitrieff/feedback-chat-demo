# feedback-chat

AI-powered feedback widget for Next.js. Users chat with an AI advisor, and depending on your tier, feedback can automatically become GitHub issues or even fully implemented PRs.

```
User chats with AI → refines idea → GitHub issue → Claude agent implements → PR → preview → approve
```

## What You Need

Check what you have, then pick the highest tier you can run:

| You have... | You can run... |
|-------------|---------------|
| Anthropic API key | **Chat only** — AI conversations, localStorage persistence |
| + GitHub PAT + repo | **+ GitHub** — Chat + auto-creates issues from feedback |
| + Railway or Docker + Claude Max or API key | **+ Pipeline** — Chat + GitHub + autonomous code agent |

Each tier builds on the previous one. You can start with Chat and upgrade later.

### Prerequisites checklist

| Prerequisite | Required for | How to get it |
|-------------|-------------|---------------|
| `ANTHROPIC_API_KEY` | All tiers | [console.anthropic.com](https://console.anthropic.com/) |
| `FEEDBACK_PASSWORD` | All tiers | Any string you choose |
| `GITHUB_TOKEN` (PAT, `ghp_` prefix) | GitHub, Pipeline | [github.com/settings/tokens/new](https://github.com/settings/tokens/new) — `repo` + `workflow` scopes |
| `GITHUB_REPO` | GitHub, Pipeline | Format: `owner/repo` |
| `railway` CLI | Pipeline (Railway) | `npm install -g @railway/cli` |
| `gh` CLI | Labels + webhook automation | [cli.github.com](https://cli.github.com/) (optional — can do manually) |
| Claude Max **or** `ANTHROPIC_API_KEY` | Pipeline agent | Max = $0/run via OAuth; API key = pay per token |

> **`GITHUB_TOKEN` must be a Personal Access Token (`ghp_` prefix).** Do not use `gh auth token` — it returns a short-lived OAuth token (`gho_`) that expires in ~8 hours.

> **React 19.1.0 and 19.1.1 are excluded** by `@ai-sdk/react`. Check with `npm ls react` — if affected, run `npm install react@latest react-dom@latest` before proceeding.

## Install

These steps are the same regardless of tier.

### 1. Install the package

```bash
npm install @nikitadmitrieff/feedback-chat \
  @assistant-ui/react @assistant-ui/react-ai-sdk @assistant-ui/react-markdown \
  ai @ai-sdk/anthropic
```

### 2. Configure Tailwind v4

Add this line to your `globals.css`, right after `@import "tailwindcss"`:

```css
@source "../node_modules/@nikitadmitrieff/feedback-chat/dist/**/*.js";
```

**This is mandatory.** Tailwind v4 does not scan `node_modules`. Without this line, the widget renders completely unstyled.

### 3. Create API routes

Create two route files in your Next.js app directory (`app/` or `src/app/`):

**`api/feedback/chat/route.ts`**

```ts
import { createFeedbackHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  // projectContext: 'Brief description of your app — helps the AI give better advice',

  // Uncomment for +GitHub or +Pipeline:
  // github: {
  //   token: process.env.GITHUB_TOKEN!,
  //   repo: process.env.GITHUB_REPO!,
  // },
})

export const POST = handler.POST
```

**`api/feedback/status/route.ts`**

```ts
import { createStatusHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createStatusHandler({
  password: process.env.FEEDBACK_PASSWORD!,

  // Uncomment for +GitHub or +Pipeline:
  // github: {
  //   token: process.env.GITHUB_TOKEN!,
  //   repo: process.env.GITHUB_REPO!,
  // },

  // Uncomment for +Pipeline only:
  // agentUrl: process.env.AGENT_URL,
})

export const { GET, POST } = handler
```

Uncomment the lines matching your tier.

### 4. Add the component

Create a client component (e.g., `components/FeedbackButton.tsx`):

```tsx
'use client'

import { useState } from 'react'
import { FeedbackPanel } from '@nikitadmitrieff/feedback-chat'
import '@nikitadmitrieff/feedback-chat/styles.css'

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  return <FeedbackPanel isOpen={open} onToggle={() => setOpen(!open)} />
}
```

Then add it to your root layout:

```tsx
import { FeedbackButton } from '@/components/FeedbackButton'

// Inside <body>:
<FeedbackButton />
```

### 5. Set environment variables

Add to `.env.local`:

```env
# All tiers
ANTHROPIC_API_KEY=sk-ant-...
FEEDBACK_PASSWORD=your-password

# +GitHub and +Pipeline — uncomment if applicable
# GITHUB_TOKEN=ghp_...
# GITHUB_REPO=owner/repo

# +Pipeline only — set after deploying the agent
# AGENT_URL=https://your-agent.railway.app
```

### 6. Verify

Run `npm run dev`, open your app, and click the feedback bar at the bottom of the screen. Enter your password and chat.

---

## +GitHub: Create labels

If your tier includes GitHub, the widget needs these labels on your repo. If you have the `gh` CLI:

```bash
gh label create feedback-bot --color 0E8A16 --description "Created by feedback widget" --force
gh label create auto-implement --color 1D76DB --description "Agent should implement this" --force
gh label create in-progress --color FBCA04 --description "Agent is working on this" --force
gh label create agent-failed --color D93F0B --description "Agent build/lint failed" --force
gh label create preview-pending --color C5DEF5 --description "PR ready, preview deploying" --force
gh label create rejected --color E4E669 --description "User rejected changes" --force
```

**Without `gh` CLI:** Create them manually at `github.com/OWNER/REPO/labels`.

After creating labels, submit feedback through the widget — you should see issues appear with the `feedback-bot` label.

---

## +Pipeline: Deploy the agent

The agent is a separate Fastify server that listens for GitHub webhooks and uses Claude Code CLI to implement changes. You need to clone it, deploy it, and connect it to your repo.

### Option A: Railway (recommended)

**Requires:** `railway` CLI installed and logged in.

```bash
# 1. Clone the agent
git clone --depth 1 https://github.com/NikitaDmitrieff/feedback-chat
cd feedback-chat/packages/agent

# 2. Create project and deploy
railway init
railway up --detach

# 3. Link the service (required before setting variables)
railway service status --all          # note the service name
railway service link <service-name>

# 4. Set env vars (batch them in one command)
railway variables set \
  GITHUB_TOKEN=ghp_... \
  GITHUB_REPO=owner/repo \
  WEBHOOK_SECRET=$(openssl rand -hex 32)

# 5. Set Claude auth — pick one:
# Max ($0/run):
railway variables set CLAUDE_CREDENTIALS_JSON='...'
# API key (pay per token):
railway variables set ANTHROPIC_API_KEY=sk-ant-...

# 6. Get the public URL
railway domain
```

> `railway domain` prints decorated output. Extract the clean URL with: `railway domain 2>&1 | grep -oE 'https://[^ ]+'`

**Don't have `railway` CLI?** Install it with `npm install -g @railway/cli && railway login`. Or use Docker (below).

#### Getting Claude Max credentials

If you chose Max OAuth, extract credentials from your local keychain (macOS):

```bash
security find-generic-password -s "Claude Code-credentials" -a "$USER" -w
```

Copy the JSON output and pass it as `CLAUDE_CREDENTIALS_JSON`. The agent handles token refresh automatically.

### Option B: Docker

```bash
cd packages/agent
docker build -t feedback-agent .
docker run -p 3000:3000 --env-file .env feedback-agent
```

Create a `.env` file with `GITHUB_TOKEN`, `GITHUB_REPO`, `WEBHOOK_SECRET`, and your Claude auth choice.

The Dockerfile handles everything: TypeScript compilation, git/curl install, non-root user, and Claude CLI setup.

### Connect the webhook

After deploying, connect your GitHub repo to the agent.

**With `gh` CLI:**

```bash
gh api repos/OWNER/REPO/hooks \
  -f name=web -F active=true \
  -f "config[url]=https://YOUR-AGENT-URL/webhook/github" \
  -f "config[content_type]=json" \
  -f "config[secret]=YOUR_WEBHOOK_SECRET" \
  -f 'events[]=issues'
```

> `config[content_type]=json` is required. The default (`form-urlencoded`) causes 415 errors.

**Without `gh` CLI:** Go to your repo Settings > Webhooks > Add webhook. Set the payload URL to `https://YOUR-AGENT-URL/webhook/github`, content type to `application/json`, the secret to your `WEBHOOK_SECRET`, and select only **Issues** events.

### Finish up

1. Add `AGENT_URL=https://your-agent-url` to your app's `.env.local`
2. Uncomment `agentUrl` in your status route
3. Verify the agent: `curl https://your-agent-url/health`
4. Submit feedback — the PipelineTracker should show progression through: created, queued, running, validating, preview_ready

---

## Automated setup

### CLI wizard

```bash
npx feedback-chat init
```

Walks you through tier selection, creates API routes, configures Tailwind, sets up `.env.local`, creates the client component, and creates GitHub labels (if you have the `gh` CLI).

### Agent deployment script

```bash
npx feedback-chat deploy-agent
```

Generates a self-contained bash script for Railway deployment. It reads your `.env.local`, asks for auth preferences, and outputs a script you can review before running.

### Claude Code

If you use [Claude Code](https://claude.ai/code), just say:

> Install @nikitadmitrieff/feedback-chat — I want the [Chat / +GitHub / +Pipeline] tier

See [`CLAUDE.md`](./CLAUDE.md) for the full installation spec.

---

## Customization

### System prompt

```ts
// Replace the default prompt entirely:
createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  systemPrompt: 'You are a helpful product advisor for Acme Corp...',
})

// Or inject context into the default prompt:
createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  projectContext: 'E-commerce platform with cart, checkout, and user accounts.',
})
```

### AI model

Any AI SDK-compatible model works. Default is Claude Haiku.

```ts
import { createAnthropic } from '@ai-sdk/anthropic'

createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  model: createAnthropic()('claude-sonnet-4-5-20250929'),
})
```

### Full server config

```ts
createFeedbackHandler({
  password: string                    // Required
  model?: LanguageModel               // Default: claude-haiku-4-5-20251001
  systemPrompt?: string               // Replaces default prompt
  projectContext?: string             // Injected into default prompt
  github?: {
    token: string
    repo: string
    labels?: string[]                 // Extra labels beyond feedback-bot + auto-implement
  }
})

createStatusHandler({
  password: string                    // Required
  github?: { token: string, repo: string }
  agentUrl?: string                   // Agent health endpoint for pipeline tracking
})
```

### Client component

`FeedbackPanel` has two props:

```tsx
<FeedbackPanel
  isOpen={boolean}
  onToggle={() => void}
/>
```

That's it. No `statusUrl`, no `apiUrl` configuration needed — it defaults to `/api/feedback/chat` and pipeline tracking is handled internally by `PipelineTracker`.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Widget renders unstyled | Missing `@source` directive in `globals.css` | Add `@source "../node_modules/@nikitadmitrieff/feedback-chat/dist/**/*.js";` after `@import "tailwindcss"` |
| Widget invisible | Missing styles import | Add `import '@nikitadmitrieff/feedback-chat/styles.css'` in your client component |
| Build fails on React 19 | `@ai-sdk/react` excludes 19.1.0/19.1.1 | `npm install react@latest react-dom@latest` |
| 401 on chat | Wrong password | Check `FEEDBACK_PASSWORD` in `.env.local` matches what you type |
| Issues not created | Wrong token or missing config | Ensure `GITHUB_TOKEN` (`ghp_` prefix) and `GITHUB_REPO` are set, and `github` config is passed to handlers |
| Issues silently stop working | `gho_` token expired | Replace with a PAT (`ghp_`) from [github.com/settings/tokens/new](https://github.com/settings/tokens/new) |
| Pipeline stuck at "queued" | Agent not receiving webhooks | Check agent health (`curl .../health`), webhook config (Issues events, correct secret) |
| Webhook returns 415 | Wrong content type | Recreate webhook with `config[content_type]=json` |
| `railway variables set` fails | Service not linked | Run `railway up --detach` first, then `railway service link <name>` |
| Agent: "Not logged in" | OAuth not configured | Set `CLAUDE_CREDENTIALS_JSON`, ensure Dockerfile has `hasCompletedOnboarding` |
| Agent: "cannot use root" | Docker running as root | Dockerfile must create and switch to a non-root user |

See [docs/troubleshooting.md](./docs/troubleshooting.md) for detailed solutions.

---

## Agent env vars reference

Set these on your **agent service** (Railway/Docker), not your Next.js app:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub PAT (`ghp_` prefix), `repo` + `workflow` scopes |
| `GITHUB_REPO` | Yes | Target repo (`owner/name`) |
| `WEBHOOK_SECRET` | Yes | Random string for HMAC verification |
| `CLAUDE_CREDENTIALS_JSON` | One of | Max OAuth credentials ($0/run) |
| `ANTHROPIC_API_KEY` | One of | API key (pay per token) |
| `AGENT_INSTALL_CMD` | No | Default: `npm ci` |
| `AGENT_BUILD_CMD` | No | Default: `npm run build` |
| `AGENT_LINT_CMD` | No | Default: `npm run lint` |
| `AGENT_CLAUDE_TIMEOUT_MS` | No | Default: 900000 (15 min) |
| `AGENT_JOB_BUDGET_MS` | No | Default: 1500000 (25 min) |
| `PORT` | No | Default: 3000 |

---

## Contributing

```bash
git clone https://github.com/NikitaDmitrieff/feedback-chat
cd feedback-chat
npm install
npm run build
npm run dev       # watch mode
npm run test      # vitest
```

```
feedback-chat/
├── packages/
│   ├── widget/   ← npm package (@nikitadmitrieff/feedback-chat)
│   │   └── src/
│   │       ├── client/   ← React components + hooks
│   │       ├── server/   ← Route handler factories
│   │       └── cli/      ← Setup wizard + deploy script
│   └── agent/    ← Deployable Fastify service
│       └── src/  ← Server, worker, webhook, OAuth
└── docs/         ← Detailed guides
```

## License

MIT
