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

When asked to install this widget in a Next.js app, follow these steps exactly:

### Step 1: Install package + peer dependencies

```bash
npm install @nikitadmitrieff/feedback-chat @assistant-ui/react @assistant-ui/react-ai-sdk @assistant-ui/react-markdown ai @ai-sdk/anthropic
```

If the consumer has `react@19.1.0` or `19.1.1`, update React first:
```bash
npm install react@latest react-dom@latest
```

### Step 2: Configure Tailwind v4

Find the consumer's main CSS file (usually `globals.css` or `app/globals.css`). Add this line after `@import "tailwindcss"`:

```css
@source "../node_modules/@nikitadmitrieff/feedback-chat/dist/**/*.js";
```

This is CRITICAL. Without it, the widget renders completely unstyled because Tailwind v4 excludes `node_modules` from automatic content detection.

### Step 3: Create chat API route

Create `{app-dir}/api/feedback/chat/route.ts`:

```ts
import { createFeedbackHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,
  // Uncomment for GitHub issue creation:
  // github: {
  //   token: process.env.GITHUB_TOKEN!,
  //   repo: process.env.GITHUB_REPO!,
  // },
})

export const POST = handler.POST
```

### Step 4: Create status API route

Create `{app-dir}/api/feedback/status/route.ts`:

```ts
import { createStatusHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createStatusHandler({
  password: process.env.FEEDBACK_PASSWORD!,
})

export const { GET, POST } = handler
```

### Step 5: Create client wrapper component

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

### Step 6: Add to layout

In the root layout (Server Component), import and render the client wrapper:

```tsx
import { FeedbackButton } from '@/components/FeedbackButton'

// Inside the <body>:
<FeedbackButton />
```

### Step 7: Environment variables

Add to `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...       # Required
FEEDBACK_PASSWORD=your-password    # Required
# GITHUB_TOKEN=ghp_...            # Optional
# GITHUB_REPO=owner/repo          # Optional
```

### Step 8: Update consumer's CLAUDE.md

Add this section to the consumer project's CLAUDE.md:

```markdown
## Feedback Widget

- Uses `@nikitadmitrieff/feedback-chat` for the feedback chatbot
- API routes: `/api/feedback/chat` (POST) and `/api/feedback/status` (GET, POST)
- Client: `<FeedbackPanel>` in a 'use client' wrapper, requires styles.css import
- Tailwind v4: `@source` directive in globals.css scans widget's dist for utility classes
- Env vars: `ANTHROPIC_API_KEY`, `FEEDBACK_PASSWORD`, optionally `GITHUB_TOKEN`/`GITHUB_REPO`
- The widget is self-contained with its own dark theme — do not override its CSS
- localStorage keys: `feedback_conversations`, `feedback_conv_{id}`, `feedback_active_conv`
```

## Gotchas

- `react@19.1.0` and `19.1.1` are excluded by `@ai-sdk/react` — consumer needs `>=19.1.2`
- Tailwind v4 does NOT scan `node_modules` — the `@source` directive is mandatory
- FeedbackPanel MUST be in a `'use client'` component (uses useState, useEffect, sessionStorage)
- The `styles.css` import is required — without it the widget has no glassmorphism theme
- The widget renders as a fixed-position side panel (right edge) + bottom-center trigger bar
