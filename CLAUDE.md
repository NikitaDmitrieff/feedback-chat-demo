# feedback-chat

AI-powered feedback widget for Next.js apps. Monorepo with two packages.

## Commands

```bash
npm install          # Install all workspace deps
npm run build        # Build all packages (turbo)
npm run dev          # Watch mode
npm run test         # Run tests
```

## Architecture

```
packages/
├── widget/    # npm package (@nikitadmitrieff/feedback-chat)
│   └── src/
│       ├── client/   # React components (FeedbackPanel, PipelineTracker, Thread)
│       ├── server/   # Route handler factories (createFeedbackHandler, createStatusHandler)
│       └── cli/      # npx setup wizard
└── agent/     # Deployable Fastify service (clone → Claude CLI → validate → PR)
```

## Package Exports

- `@nikitadmitrieff/feedback-chat` → client components (FeedbackPanel, useConversations, PipelineTracker)
- `@nikitadmitrieff/feedback-chat/server` → server factories (createFeedbackHandler, createStatusHandler)
- `@nikitadmitrieff/feedback-chat/styles.css` → self-contained dark glassmorphism styles

## Key Patterns

- Widget CSS is scoped under `.feedback-panel` — isolated from consumer themes
- Widget uses Tailwind utility classes that must be scanned by the consumer's Tailwind (see installation below)
- Client bundle has `"use client"` banner injected by tsup
- AI SDK v6: uses `inputSchema` (not `parameters`), `stepCountIs()`, `toUIMessageStreamResponse()`
- Build copies styles.css manually: `tsup && cp src/client/styles.css dist/styles.css`

## Installing in a Consumer App

When asked to install this widget in a Next.js app, follow these steps exactly.

### Step 0: Choose a tier

**Ask the user which tier they want before proceeding.** There are three tiers:

| Tier | What you get | What you need |
|------|-------------|---------------|
| **Chat only** | AI conversations, localStorage persistence | `ANTHROPIC_API_KEY` + `FEEDBACK_PASSWORD` |
| **+ GitHub** | Chat + auto-creates GitHub issues | + `GITHUB_TOKEN` + `GITHUB_REPO` |
| **+ Pipeline** | Chat + GitHub + agent writes code → PR → preview → approve | + `AGENT_URL` + Railway/Docker deployment |

If the user doesn't specify, default to **Chat only** and mention the other tiers are available.

### Step 1: Check React version

**This is a build breaker.** `@ai-sdk/react` explicitly excludes `react@19.1.0` and `19.1.1`.

Check: `npm ls react`

If the consumer has `react@19.1.0` or `19.1.1`, upgrade first:
```bash
npm install react@latest react-dom@latest
```

### Step 2: Install package + peer dependencies

```bash
npm install @nikitadmitrieff/feedback-chat @assistant-ui/react @assistant-ui/react-ai-sdk @assistant-ui/react-markdown ai @ai-sdk/anthropic
```

### Step 3: Configure Tailwind v4

Find the consumer's main CSS file (usually `globals.css` or `app/globals.css`). Add this line after `@import "tailwindcss"`:

```css
@source "../node_modules/@nikitadmitrieff/feedback-chat/dist/**/*.js";
```

This is CRITICAL. Without it, the widget renders completely unstyled because Tailwind v4 excludes `node_modules` from automatic content detection.

### Step 4: Create chat API route

Create `{app-dir}/api/feedback/chat/route.ts`.

**If Chat only:**

```ts
import { createFeedbackHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
})

export const POST = handler.POST
```

**If + GitHub or + Pipeline:**

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

### Step 5: Create status API route

Create `{app-dir}/api/feedback/status/route.ts`.

**If Chat only:**

```ts
import { createStatusHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createStatusHandler({
  password: process.env.FEEDBACK_PASSWORD!,
})

export const { GET, POST } = handler
```

**If + GitHub (no agent):**

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

**If + Pipeline:**

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

### Step 6: Create client wrapper component

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

### Step 7: Add to layout

In the root layout (Server Component), import and render the client wrapper:

```tsx
import { FeedbackButton } from '@/components/FeedbackButton'

// Inside the <body>:
<FeedbackButton />
```

### Step 8: Environment variables

Add to `.env.local`:

**Chat only:**

```env
ANTHROPIC_API_KEY=sk-ant-...       # Required
FEEDBACK_PASSWORD=your-password    # Required
```

**+ GitHub:**

```env
ANTHROPIC_API_KEY=sk-ant-...       # Required
FEEDBACK_PASSWORD=your-password    # Required
GITHUB_TOKEN=ghp_...              # Needs 'repo' scope
GITHUB_REPO=owner/repo            # e.g. nikitadmitrieff/my-app
```

**+ Pipeline:**

```env
ANTHROPIC_API_KEY=sk-ant-...       # Required
FEEDBACK_PASSWORD=your-password    # Required
GITHUB_TOKEN=ghp_...              # Needs 'repo' scope
GITHUB_REPO=owner/repo            # e.g. nikitadmitrieff/my-app
AGENT_URL=https://your-agent.railway.app
```

### Step 9: Create GitHub labels (+ GitHub and + Pipeline only)

The package uses specific labels to track pipeline state. Create them on the consumer's repo:

```bash
gh label create feedback-bot --color 0E8A16 --description "Created by feedback widget"
gh label create auto-implement --color 1D76DB --description "Agent should implement this"
gh label create in-progress --color FBCA04 --description "Agent is working on this"
gh label create agent-failed --color D93F0B --description "Agent build/lint failed"
gh label create preview-pending --color C5DEF5 --description "PR ready, preview deploying"
gh label create rejected --color E4E669 --description "User rejected changes"
```

### Step 10: Deploy the agent (+ Pipeline only)

The agent is a separate service. The npm consumer doesn't have it — they need to clone it:

```bash
git clone https://github.com/NikitaDmitrieff/feedback-chat
cd feedback-chat/packages/agent
```

#### Railway deployment

```bash
npm install -g @railway/cli
railway login
railway init
railway variables set GITHUB_TOKEN=ghp_...
railway variables set GITHUB_REPO=owner/repo
railway variables set WEBHOOK_SECRET=$(openssl rand -hex 32)
# Choose one:
railway variables set CLAUDE_CREDENTIALS_JSON='...'  # Max ($0/run)
# or:
railway variables set ANTHROPIC_API_KEY=sk-ant-...    # API key (pay per token)
railway up
railway domain  # Save this URL for AGENT_URL and webhook
```

#### Docker deployment

```bash
cd packages/agent
docker build -t feedback-agent .
docker run -p 3000:3000 --env-file .env feedback-agent
```

### Step 11: Configure GitHub webhook (+ Pipeline only)

1. Go to repo → **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL:** `https://<your-agent>.railway.app/webhook/github`
3. **Content type:** `application/json`
4. **Secret:** same value as `WEBHOOK_SECRET` on the agent
5. **Events:** Select "Let me select individual events" → check **Issues** only
6. Click **Add webhook**

Or automate:

```bash
gh api repos/OWNER/REPO/hooks \
  -f url="https://your-agent.railway.app/webhook/github" \
  -f content_type=json \
  -f secret="WEBHOOK_SECRET_VALUE" \
  -f 'events[]=issues'
```

### Step 12: Verify

1. Run `npm run dev`
2. Open the app — you should see a feedback trigger bar at the bottom-center
3. Click it, enter your feedback password, send a message
4. The AI should respond and you can have a conversation
5. **(+ GitHub)** Submit feedback and check the repo's Issues tab for a new issue with `feedback-bot` label
6. **(+ Pipeline)** The PipelineTracker should show stage progression: created → queued → running → validating → preview_ready
7. **(+ Pipeline)** At `preview_ready`, approve/reject/request changes buttons should appear

### Step 13: Update consumer's CLAUDE.md

Add this section to the consumer project's CLAUDE.md:

**Chat only:**

```markdown
## Feedback Widget

- Uses `@nikitadmitrieff/feedback-chat` for the feedback chatbot
- API routes: `/api/feedback/chat` (POST) and `/api/feedback/status` (GET, POST)
- Client: `<FeedbackPanel>` in a 'use client' wrapper, requires styles.css import
- Tailwind v4: `@source` directive in globals.css scans widget's dist for utility classes
- Env vars: `ANTHROPIC_API_KEY`, `FEEDBACK_PASSWORD`
- The widget is self-contained with its own dark theme — do not override its CSS
- localStorage keys: `feedback_conversations`, `feedback_conv_{id}`, `feedback_active_conv`
```

**+ GitHub:**

```markdown
## Feedback Widget

- Uses `@nikitadmitrieff/feedback-chat` for the feedback chatbot
- API routes: `/api/feedback/chat` (POST) and `/api/feedback/status` (GET, POST)
- Client: `<FeedbackPanel>` in a 'use client' wrapper, requires styles.css import
- Tailwind v4: `@source` directive in globals.css scans widget's dist for utility classes
- Env vars: `ANTHROPIC_API_KEY`, `FEEDBACK_PASSWORD`, `GITHUB_TOKEN`, `GITHUB_REPO`
- GitHub labels: `feedback-bot`, `auto-implement`, `in-progress`, `agent-failed`, `preview-pending`, `rejected`
- The widget is self-contained with its own dark theme — do not override its CSS
- localStorage keys: `feedback_conversations`, `feedback_conv_{id}`, `feedback_active_conv`
```

**+ Pipeline:**

```markdown
## Feedback Widget

- Uses `@nikitadmitrieff/feedback-chat` for the feedback chatbot
- API routes: `/api/feedback/chat` (POST) and `/api/feedback/status` (GET, POST)
- Client: `<FeedbackPanel>` in a 'use client' wrapper, requires styles.css import
- Tailwind v4: `@source` directive in globals.css scans widget's dist for utility classes
- Env vars: `ANTHROPIC_API_KEY`, `FEEDBACK_PASSWORD`, `GITHUB_TOKEN`, `GITHUB_REPO`, `AGENT_URL`
- GitHub labels: `feedback-bot`, `auto-implement`, `in-progress`, `agent-failed`, `preview-pending`, `rejected`
- Pipeline stages: created → queued → running → validating → preview_ready → deployed (+ failed/rejected)
- Agent deployed on Railway/Docker, webhook on Issues events
- The widget is self-contained with its own dark theme — do not override its CSS
- localStorage keys: `feedback_conversations`, `feedback_conv_{id}`, `feedback_active_conv`
```

## Gotchas

- `react@19.1.0` and `19.1.1` are excluded by `@ai-sdk/react` — consumer needs `>=19.1.2`. **Check before installing.**
- Tailwind v4 does NOT scan `node_modules` — the `@source` directive is mandatory
- FeedbackPanel MUST be in a `'use client'` component (uses useState, useEffect, sessionStorage)
- The `styles.css` import is required — without it the widget has no glassmorphism theme
- The widget renders as a fixed-position side panel (right edge) + bottom-center trigger bar
- For + Pipeline: `agentUrl` must be passed to `createStatusHandler` or the tracker can't check agent status
- GitHub labels must be created on the consumer's repo before the pipeline can function
