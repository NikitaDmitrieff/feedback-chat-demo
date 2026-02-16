# feedback-chat

AI-powered feedback chatbot that turns user ideas into code — from chat to PR, fully automated.

```
User submits idea → AI chat refines it → GitHub issue → Claude Code agent implements → PR opened → preview deployed → user approves in widget
```

## Choose Your Tier

Pick your tier first, then follow the matching setup path below.

| Tier | What you get | Cost | What you need |
|------|-------------|------|---------------|
| **Chat only** | AI conversations, localStorage persistence | ~$0.01/conversation | API key + password |
| **+ GitHub** | Chat + auto-creates GitHub issues from feedback | same | + GitHub token/repo |
| **+ Pipeline** | Chat + GitHub + agent writes code → PR → preview → approve in widget | + ~$5/mo Railway | + Claude Max + Railway |

**If you have Claude Max ($200/mo), you get unlimited feedback-to-code automation for the cost of a ~$5/mo Railway instance.**

## Architecture

```
┌─────────────────────────────────────────────┐
│  Your Next.js App                           │
│                                             │
│  <FeedbackPanel />                          │
│  import '@nikitadmitrieff/feedback-chat/styles.css' │
│                                             │
│  API routes (one-liner exports):            │
│    /api/feedback/chat                       │
│    /api/feedback/status                     │
└──────────────┬──────────────────────────────┘
               │
     GitHub Issues + Labels
               │
               ▼
┌──────────────────────────────────────┐
│  Agent Service (Railway/Docker)      │
│                                      │
│  Fastify server + GitHub webhook     │
│  Clone → Claude CLI → Validate → PR │
│  OAuth token refresh (Max sub)       │
│  Vercel preview via GitHub deploy    │
└──────────────────────────────────────┘
```

## Pre-Flight Check

> **React 19 users: this is a build breaker, not a footnote.**
>
> `@ai-sdk/react` explicitly excludes `react@19.1.0` and `19.1.1`. If you're on either version, upgrade first:
>
> ```bash
> npm install react@latest react-dom@latest
> ```
>
> Check your version: `npm ls react`

## Quick Start

### Option A: Let Claude install it (recommended)

If you use [Claude Code](https://claude.ai/code), just say:

> Install @nikitadmitrieff/feedback-chat in my app — I want the [Chat / +GitHub / +Pipeline] tier

Claude will install the package, create your API routes, configure Tailwind, and add the component to your layout. See [`CLAUDE.md`](./CLAUDE.md) for the full installation spec Claude follows.

### Option B: CLI wizard

```bash
npx feedback-chat init
```

This creates your API routes, configures `.env.local`, and patches your CSS for Tailwind v4.

### Option C: Manual setup

Pick your tier and follow the steps below.

---

## Chat Only Setup

### 1. Install the package and peer dependencies

```bash
npm install @nikitadmitrieff/feedback-chat \
  @assistant-ui/react @assistant-ui/react-ai-sdk @assistant-ui/react-markdown \
  ai @ai-sdk/anthropic
```

### 2. Configure Tailwind v4

Add this line near the top of your `globals.css` (after `@import "tailwindcss"`):

```css
@source "../node_modules/@nikitadmitrieff/feedback-chat/dist/**/*.js";
```

**This is mandatory.** Tailwind v4 excludes `node_modules` from automatic content detection. Without this line, the widget will render completely unstyled.

### 3. Create the chat API route

Create `app/api/feedback/chat/route.ts` (or `src/app/api/feedback/chat/route.ts`):

```ts
import { createFeedbackHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
})

export const POST = handler.POST
```

### 4. Create the status API route

Create `app/api/feedback/status/route.ts`:

```ts
import { createStatusHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createStatusHandler({
  password: process.env.FEEDBACK_PASSWORD!,
})

export const { GET, POST } = handler
```

### 5. Add FeedbackPanel to your app

Create a **client component** (must have `'use client'`):

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

Then render it in your layout:

```tsx
// app/layout.tsx (Server Component — no 'use client' needed here)
import { FeedbackButton } from '@/components/FeedbackButton'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <FeedbackButton />
      </body>
    </html>
  )
}
```

### 6. Environment variables

Add to `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...       # Required — powers the chat (Haiku by default)
FEEDBACK_PASSWORD=your-password    # Required — gates access to the chatbot
```

### 7. Verify

1. Run `npm run dev`
2. Open the app — you should see a feedback trigger bar at the bottom-center
3. Click it, enter your feedback password, send a message
4. The AI should respond and you can have a conversation

---

## + GitHub Setup

Follow all steps from Chat Only, then apply these changes:

### Update the chat API route

```ts
import { createFeedbackHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  github: {
    token: process.env.GITHUB_TOKEN!,
    repo: process.env.GITHUB_REPO!,
  },
})

export const POST = handler.POST
```

### Update the status API route

```ts
import { createStatusHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createStatusHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  github: {
    token: process.env.GITHUB_TOKEN!,
    repo: process.env.GITHUB_REPO!,
  },
})

export const { GET, POST } = handler
```

### Create required GitHub labels

The package uses specific labels to track pipeline state. Create them on your repo:

```bash
gh label create feedback-bot --color 0E8A16 --description "Created by feedback widget"
gh label create auto-implement --color 1D76DB --description "Agent should implement this"
gh label create in-progress --color FBCA04 --description "Agent is working on this"
gh label create agent-failed --color D93F0B --description "Agent build/lint failed"
gh label create preview-pending --color C5DEF5 --description "PR ready, preview deploying"
gh label create rejected --color E4E669 --description "User rejected changes"
```

### Additional environment variables

```env
GITHUB_TOKEN=ghp_...              # MUST be a PAT (ghp_ prefix) — 'repo' + 'workflow' scopes
GITHUB_REPO=owner/repo            # e.g. nikitadmitrieff/my-app
```

> **Warning:** `GITHUB_TOKEN` must start with `ghp_` (Personal Access Token). Tokens starting with `gho_` are short-lived GitHub OAuth tokens that expire after ~8 hours and will silently break issue creation. Generate a PAT at [github.com/settings/tokens/new](https://github.com/settings/tokens/new).

### Verify

1. Open the widget, have a conversation, submit feedback
2. Check your repo's Issues tab — a new issue should appear with `feedback-bot` and `auto-implement` labels
3. The issue body should contain a `## Generated Prompt` code block

---

## + Pipeline Setup

Follow all steps from + GitHub, then apply these changes:

### Update the status API route with agentUrl

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

### Deploy the agent service

The agent is a separate Fastify server that processes GitHub webhooks. **npm consumers don't have it** — you need to clone it separately.

#### Railway (recommended)

1. Clone the agent:

```bash
git clone https://github.com/NikitaDmitrieff/feedback-chat
cd feedback-chat/packages/agent
```

2. Install Railway CLI and login:

```bash
npm install -g @railway/cli
railway login
```

3. Create a Railway project and do the first deploy:

```bash
railway init
railway up --detach    # creates the service
```

4. Link the service (required before you can set variables):

```bash
railway service status --all    # note the service name
railway service link <name>     # link it
```

5. Set environment variables:

```bash
railway variables set GITHUB_TOKEN=ghp_...
railway variables set GITHUB_REPO=owner/repo
railway variables set WEBHOOK_SECRET=$(openssl rand -hex 32)
```

6. Set Claude authentication (choose one):

**Option A: Max subscription (recommended, $0/run)**

The agent uses `CLAUDE_CODE_OAUTH_TOKEN` internally to authenticate the CLI in headless Docker. To set it up:

```bash
railway variables set CLAUDE_CREDENTIALS_JSON='{"claudeAiOauth":{"accessToken":"...","refreshToken":"...","expiresAt":...}}'
```

The credentials JSON comes from your Claude Code CLI keychain entry. On macOS:
```bash
security find-generic-password -s "Claude Code-credentials" -a "YOUR_USERNAME" -w
```

The agent refreshes the OAuth token automatically before each job. The Dockerfile includes `{"hasCompletedOnboarding": true}` in `~/.claude.json` — this is required for `CLAUDE_CODE_OAUTH_TOKEN` to work (see [anthropics/claude-code#8938](https://github.com/anthropics/claude-code/issues/8938)).

**Option B: API key (pay per token)**

```bash
railway variables set ANTHROPIC_API_KEY=sk-ant-...
```

7. Get your agent URL:

```bash
railway domain
```

Save this URL — you need it for the webhook and `AGENT_URL` env var.

> **Note:** Railway auto-redeploys when env vars change. After step 5-6, wait for the deploy to succeed before testing.

#### Docker

The Dockerfile uses a **multi-stage build** — you do NOT need to pre-build `dist/`. It compiles TypeScript in the builder stage, then copies the result to the runtime stage.

```bash
cd packages/agent
docker build -t feedback-agent .
docker run -p 3000:3000 --env-file .env feedback-agent
```

Key things the Dockerfile handles:
- Installs `git`, `curl`, `ca-certificates` (the agent needs git to clone consumer repos)
- Creates a non-root `agent` user (Claude Code CLI refuses `--dangerously-skip-permissions` as root)
- Writes `{"hasCompletedOnboarding": true}` to `~/.claude.json` (required for OAuth)

### Configure GitHub webhook

1. Go to your repo → **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL:** `https://<your-agent>.railway.app/webhook/github`
3. **Content type:** `application/json`
4. **Secret:** same value as your `WEBHOOK_SECRET` env var
5. **Events:** Select "Let me select individual events" → check **Issues** only
6. Click **Add webhook**

Or automate it (**`config[content_type]=json` is required** — the default is `form-urlencoded` which the agent rejects with 415):

```bash
gh api repos/OWNER/REPO/hooks \
  -f name=web -f active=true \
  -f "config[url]=https://your-agent.railway.app/webhook/github" \
  -f "config[content_type]=json" \
  -f "config[secret]=YOUR_WEBHOOK_SECRET" \
  -f 'events[]=issues'
```

### Additional environment variable

Add to your **app's** `.env.local`:

```env
AGENT_URL=https://your-agent.railway.app
```

### Agent environment variables (full reference)

Set these on your **agent service** (Railway/Docker):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Yes | — | GitHub PAT (`ghp_` prefix) with `repo` + `workflow` scopes |
| `GITHUB_REPO` | Yes | — | Target repository (`owner/name`) |
| `WEBHOOK_SECRET` | Yes | — | Random string for webhook HMAC verification |
| `CLAUDE_CREDENTIALS_JSON` | One of | — | Max subscription OAuth credentials ($0/run) — agent passes token via `CLAUDE_CODE_OAUTH_TOKEN` |
| `ANTHROPIC_API_KEY` | One of | — | API key fallback (pay per token) |
| `AGENT_INSTALL_CMD` | No | `npm ci` | Install command |
| `AGENT_BUILD_CMD` | No | `npm run build` | Build command |
| `AGENT_LINT_CMD` | No | `npm run lint` | Lint command |
| `AGENT_CLAUDE_TIMEOUT_MS` | No | `900000` (15 min) | Claude CLI timeout |
| `AGENT_JOB_BUDGET_MS` | No | `1500000` (25 min) | Total job time budget |
| `AGENT_ENV_FORWARD` | No | `NEXT_PUBLIC_*` | Comma-separated env var patterns to forward |
| `PORT` | No | `3000` | Fastify server port |

### Verify

1. Check the agent is running: `curl https://your-agent.railway.app/health`
2. Submit feedback through the widget — an issue should be created
3. The PipelineTracker should show stage progression: created → queued → running → validating → preview_ready
4. At `preview_ready`, you should see approve/reject/request changes buttons
5. Click approve — the PR should be merged

---

## Configuration

### Server — Route handler factory

```ts
// Minimal — one required field
createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
})

// Full config
createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  model: anthropic('claude-haiku-4-5-20251001'),
  systemPrompt: 'Your custom prompt...',
  projectContext: 'E-commerce platform with cart and checkout.',
  github: {
    token: process.env.GITHUB_TOKEN!,
    repo: process.env.GITHUB_REPO!,
    labels: ['enhancement'],  // extra labels beyond feedback-bot + auto-implement
  },
})
```

### Client — Zero config by default

```tsx
<FeedbackPanel isOpen={open} onToggle={() => setOpen(v => !v)} />

// With overrides:
<FeedbackPanel
  isOpen={open}
  onToggle={() => setOpen(v => !v)}
  apiUrl="/api/feedback/chat"
/>
```

## Customization

### System prompt

Pass a custom `systemPrompt` to `createFeedbackHandler()`:

```ts
createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  systemPrompt: 'You are a helpful product advisor for Acme Corp...',
})
```

Or use `projectContext` to inject app-specific context into the default prompt:

```ts
createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  projectContext: 'This is an e-commerce platform with product pages, cart, and checkout.',
})
```

### AI model

Any AI SDK-compatible model works:

```ts
import { createAnthropic } from '@ai-sdk/anthropic'

createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  model: createAnthropic()('claude-sonnet-4-5-20250929'),
})
```

## Troubleshooting

### `Tooltip must be used within TooltipProvider`

**Cause:** Versions `<=0.1.1` didn't wrap the component tree with `TooltipProvider`. Fixed in `0.1.2+`.

**Fix:** Update the package: `npm install @nikitadmitrieff/feedback-chat@latest`

### Widget renders unstyled / broken layout

**Cause:** Tailwind v4 excludes `node_modules` from automatic content detection, so the widget's utility classes aren't generated.

**Fix:** Add to your `globals.css` (after `@import "tailwindcss"`):

```css
@source "../node_modules/@nikitadmitrieff/feedback-chat/dist/**/*.js";
```

### npm peer dependency warnings about React

**Cause:** `@ai-sdk/react` intentionally excludes `react@19.1.0` and `19.1.1` due to known issues.

**Fix:** Update React: `npm install react@latest react-dom@latest`

### Widget is invisible / doesn't appear

Make sure you imported the styles: `import '@nikitadmitrieff/feedback-chat/styles.css'`

### 401 errors on chat

Check that `FEEDBACK_PASSWORD` in `.env.local` matches what you enter in the widget's password gate.

### GitHub issues not created

Ensure both `GITHUB_TOKEN` and `GITHUB_REPO` are set in `.env.local` and passed to `createFeedbackHandler({ github: { ... } })`.

### Pipeline stuck at "queued"

- Check agent is running: `curl https://your-agent.railway.app/health`
- Check GitHub webhook is configured (Issues events, correct secret)
- Check agent logs for signature verification errors

### Pipeline stuck at "validating"

- The agent is building and linting — check agent logs
- After 25 minutes the job budget expires — check for `agent-failed` label

### Agent fails: "git: not found"

The Dockerfile must install git in the runtime stage. If you're using a custom Dockerfile, add:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates && rm -rf /var/lib/apt/lists/*
```

### Agent fails: "--dangerously-skip-permissions cannot be used with root"

The Docker container must run as a non-root user. Add to your Dockerfile:
```dockerfile
RUN useradd -m -s /bin/bash agent
RUN chown -R agent:agent /app /tmp
USER agent
```

### Agent fails: "Not logged in" or "Invalid API key" with Max OAuth

The agent uses `CLAUDE_CODE_OAUTH_TOKEN` (not the credentials file) to authenticate in headless Docker. Ensure:
1. `CLAUDE_CREDENTIALS_JSON` is set on the agent service
2. The Dockerfile includes: `RUN echo '{"hasCompletedOnboarding":true}' > /home/agent/.claude.json`
3. Check agent logs for `[oauth] Token valid` or `[oauth] Token refreshed` messages

See [anthropics/claude-code#8938](https://github.com/anthropics/claude-code/issues/8938) for the onboarding workaround.

### Webhook returns 415 (Unsupported Media Type)

The webhook was created with `application/x-www-form-urlencoded` content type instead of `application/json`. Fix it:
```bash
gh api repos/OWNER/REPO/hooks/HOOK_ID --method PATCH \
  -f "config[content_type]=json" \
  -f "config[url]=https://your-agent.railway.app/webhook/github" \
  -f "config[secret]=YOUR_WEBHOOK_SECRET"
```

### GitHub issues silently not created (no errors)

Check if `GITHUB_TOKEN` starts with `gho_` — these are short-lived OAuth tokens that expire after ~8 hours. Replace with a PAT (`ghp_` prefix) from [github.com/settings/tokens/new](https://github.com/settings/tokens/new).

## Conventions (fixed)

These are standardized by the package — convention over configuration:

- **Branch naming:** `feedback/issue-{N}`
- **GitHub labels:** `feedback-bot`, `auto-implement`, `in-progress`, `agent-failed`, `preview-pending`, `rejected`
- **Issue format:** `## Generated Prompt` code block + `<!-- agent-meta: {...} -->` HTML comment
- **localStorage keys:** `feedback_conversations`, `feedback_conv_{id}`, `feedback_active_conv`

## Contributing

```bash
git clone https://github.com/NikitaDmitrieff/feedback-chat
cd feedback-chat
npm install
npm run build    # Build all packages
npm run dev      # Watch mode
npm run test     # Run tests
```

### Project structure

```
feedback-chat/
├── packages/
│   ├── widget/    ← npm package (@nikitadmitrieff/feedback-chat)
│   │   └── src/
│   │       ├── client/   ← React components + hooks
│   │       ├── server/   ← Route handler factories
│   │       └── cli/      ← npx setup wizard
│   └── agent/     ← Deployable service
│       └── src/   ← Fastify server + Claude CLI worker
├── turbo.json
└── package.json
```

## Peer Dependencies

```bash
npm install @assistant-ui/react @assistant-ui/react-ai-sdk @assistant-ui/react-markdown ai @ai-sdk/anthropic
```

Required versions:

```json
{
  "react": "^18 || ^19 (19.1.2+ if on React 19)",
  "react-dom": "^18 || ^19",
  "next": ">=14",
  "@assistant-ui/react": ">=0.12",
  "@assistant-ui/react-ai-sdk": ">=1.3",
  "@assistant-ui/react-markdown": ">=0.12",
  "ai": ">=6",
  "@ai-sdk/anthropic": ">=1"
}
```

## License

MIT
