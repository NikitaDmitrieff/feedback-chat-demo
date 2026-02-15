# feedback-chat

AI-powered feedback chatbot that turns user ideas into code — from chat to PR, fully automated.

```
User submits idea → AI chat refines it → GitHub issue → Claude Code agent implements → PR opened → preview deployed → user approves in widget
```

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

## Quick Start

### Option A: Let Claude install it (recommended)

If you use [Claude Code](https://claude.ai/code), just say:

> Install @nikitadmitrieff/feedback-chat in my app

Claude will install the package, create your API routes, configure Tailwind, and add the component to your layout. See [`CLAUDE.md`](./CLAUDE.md) for the full installation spec Claude follows.

### Option B: CLI wizard

```bash
npx feedback-chat init
```

This creates your API routes, configures `.env.local`, and patches your CSS for Tailwind v4.

### Option C: Manual setup

#### 1. Install the package and peer dependencies

```bash
npm install @nikitadmitrieff/feedback-chat \
  @assistant-ui/react @assistant-ui/react-ai-sdk @assistant-ui/react-markdown \
  ai @ai-sdk/anthropic
```

> **React version note:** If you're on React 19, you need `react@>=19.1.2` (not 19.1.0 or 19.1.1). The AI SDK's `@ai-sdk/react` intentionally excludes those versions. Run `npm install react@latest react-dom@latest` to update.

#### 2. Configure Tailwind v4

Add this line near the top of your `globals.css` (after `@import "tailwindcss"`):

```css
@source "../node_modules/@nikitadmitrieff/feedback-chat/dist/**/*.js";
```

This tells Tailwind v4 to scan the widget's compiled components for utility classes. **Without this line, the widget will render unstyled** because Tailwind v4 excludes `node_modules` from automatic content detection.

#### 3. Create the chat API route

Create `app/api/feedback/chat/route.ts` (or `src/app/api/feedback/chat/route.ts`):

```ts
import { createFeedbackHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  // Optional: GitHub issue creation
  // github: { token: process.env.GITHUB_TOKEN!, repo: process.env.GITHUB_REPO! },
})

export const POST = handler.POST
```

#### 4. Create the status API route

Create `app/api/feedback/status/route.ts`:

```ts
import { createStatusHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createStatusHandler({
  password: process.env.FEEDBACK_PASSWORD!,
})

export const { GET, POST } = handler
```

#### 5. Add FeedbackPanel to your app

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

#### 6. Environment variables

Add to `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...       # Required — powers the chat (Haiku by default)
FEEDBACK_PASSWORD=your-password    # Required — gates access to the chatbot

# Optional — GitHub issue creation
# GITHUB_TOKEN=ghp_...
# GITHUB_REPO=owner/repo

# Optional — pipeline agent URL
# AGENT_URL=https://your-agent.railway.app
```

## Three Tiers

| Tier | What you get | Setup |
|------|-------------|-------|
| **Chat only** | AI conversations, localStorage persistence | API key + password |
| **+ GitHub** | Issues created automatically, link shown in chat | + GitHub token/repo |
| **+ Pipeline** | Agent writes code → PR → preview → approve/reject in widget | + Claude Max OAuth + Railway |

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
  github: {
    token: process.env.GITHUB_TOKEN!,
    repo: process.env.GITHUB_REPO!,
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

### Agent — Environment variables

```env
# Required
GITHUB_TOKEN=ghp_...
GITHUB_REPO=owner/repo
WEBHOOK_SECRET=random-secret

# Claude authentication (choose one)
CLAUDE_CREDENTIALS_JSON=   # Max subscription (recommended, $0/run)
ANTHROPIC_API_KEY=         # API key fallback (pay per token)

# Optional
AGENT_INSTALL_CMD=npm ci
AGENT_BUILD_CMD=npm run build
AGENT_LINT_CMD=npm run lint
```

## Cost

| Component | Cost | Auth method |
|-----------|------|-------------|
| Chat (Haiku) | ~$0.01/conversation | `ANTHROPIC_API_KEY` |
| Code agent | $0/implementation | Claude Max OAuth |
| Railway | ~$5/month (sleeps when idle) | Railway token |
| Vercel previews | Free (hobby) or included in Pro | Existing Vercel setup |

**If you have Claude Max ($200/mo), you get unlimited feedback-to-code automation for the cost of a ~$5/mo Railway instance.**

## Self-Hosting the Agent

The agent service lives in `packages/agent/`. Deploy it anywhere that runs Docker:

### Railway (recommended)

1. Fork this repo
2. Create a new Railway project from the `packages/agent/` directory
3. Set the environment variables (see `packages/agent/.env.example`)
4. Create a GitHub webhook pointing to `https://your-app.railway.app/webhook/github`

### Docker

```bash
cd packages/agent
docker build -t feedback-agent .
docker run -p 3000:3000 --env-file .env feedback-agent
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
