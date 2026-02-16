# Feedback Intelligence Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Feedback Intelligence Hub to the dashboard — feedback inbox with AI-powered theme clustering, tester activity view, and AI digest — backed by new Supabase tables and a widget-side Supabase integration.

**Architecture:** The widget's `createFeedbackHandler` gains an optional `supabase` config. When present, every user message is persisted to `feedback_sessions` + `feedback_messages` in the `feedback_chat` schema. A new dashboard API route (`/api/feedback/[projectId]/classify`) calls Claude Haiku to generate summaries and theme tags. The dashboard gets a new `/projects/[id]/feedback` page with digest, theme pills, conversation list, and tester activity tab.

**Tech Stack:** Next.js 15 (App Router), Supabase (PostgreSQL + RLS), `@ai-sdk/anthropic` (Claude Haiku for classification), Tailwind v4, Lucide icons. No new dependencies for the dashboard. Widget gains `@supabase/supabase-js` as an optional peer dependency.

---

### Task 1: Supabase Migration — New Tables

**Files:**
- Create: `packages/dashboard/supabase/migrations/00004_feedback_tables.sql`

**Step 1: Write the migration**

```sql
-- Feedback sessions: one per widget conversation
create table feedback_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  tester_id text,
  tester_name text,
  started_at timestamptz default now(),
  last_message_at timestamptz default now(),
  message_count int default 0,
  ai_summary text,
  ai_themes jsonb,
  github_issue_number int,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'dismissed'))
);

-- Feedback messages: individual messages in a conversation
create table feedback_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references feedback_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- Feedback themes: AI-generated theme registry per project
create table feedback_themes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  description text,
  color text not null,
  message_count int default 0,
  last_seen_at timestamptz default now()
);

-- Indexes
create index idx_feedback_sessions_project on feedback_sessions(project_id, last_message_at desc);
create index idx_feedback_sessions_tester on feedback_sessions(project_id, tester_id);
create index idx_feedback_messages_session on feedback_messages(session_id, created_at);
create index idx_feedback_themes_project on feedback_themes(project_id);

-- RLS
alter table feedback_sessions enable row level security;
alter table feedback_messages enable row level security;
alter table feedback_themes enable row level security;

-- Dashboard users see their own project's data
create policy "Users see own sessions" on feedback_sessions
  for all using (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users see own messages" on feedback_messages
  for all using (session_id in (
    select fs.id from feedback_sessions fs
    join projects p on fs.project_id = p.id
    where p.user_id = auth.uid()
  ));

create policy "Users see own themes" on feedback_themes
  for all using (project_id in (select id from projects where user_id = auth.uid()));

-- Service role insert policy for widget writes (via API key auth)
-- The widget uses the service role key through the dashboard API, so service role bypasses RLS.
-- No additional policy needed for widget writes.
```

**Step 2: Apply the migration to Supabase**

Run: `npx supabase db push` (or apply via Supabase dashboard SQL editor if local CLI isn't set up)

**Step 3: Commit**

```bash
git add packages/dashboard/supabase/migrations/00004_feedback_tables.sql
git commit -m "feat(dashboard): add feedback_sessions, feedback_messages, feedback_themes tables"
```

---

### Task 2: Dashboard Types — Feedback Types

**Files:**
- Modify: `packages/dashboard/src/lib/types.ts`

**Step 1: Add feedback-related TypeScript types**

Append to the existing `types.ts`:

```ts
export type FeedbackSession = {
  id: string
  project_id: string
  tester_id: string | null
  tester_name: string | null
  started_at: string
  last_message_at: string
  message_count: number
  ai_summary: string | null
  ai_themes: string[] | null  // array of theme IDs
  github_issue_number: number | null
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed'
}

export type FeedbackMessage = {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export type FeedbackTheme = {
  id: string
  project_id: string
  name: string
  description: string | null
  color: string
  message_count: number
  last_seen_at: string
}

export type TesterSummary = {
  tester_id: string
  tester_name: string | null
  session_count: number
  last_active: string
  top_themes: { name: string; color: string; count: number }[]
  resolved_count: number
  total_count: number
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/lib/types.ts
git commit -m "feat(dashboard): add feedback session, message, theme, and tester types"
```

---

### Task 3: Widget — Supabase Feedback Persistence

**Files:**
- Modify: `packages/widget/src/server/handler.ts`
- Modify: `packages/widget/src/server/index.ts`

This is the most critical change. The widget's `createFeedbackHandler` gets an optional `supabase` config. When provided, it persists each conversation turn to the dashboard's Supabase.

**Step 1: Add supabase config to FeedbackHandlerConfig**

In `handler.ts`, add to `FeedbackHandlerConfig`:

```ts
/** Supabase configuration for feedback persistence to the dashboard */
supabase?: {
  url: string
  serviceRoleKey: string
  projectId: string  // dashboard project UUID
}
```

**Step 2: Add persistence logic after the stream**

After the `streamText` call, add a function that persists messages to Supabase. The persistence should be fire-and-forget (non-blocking) so it doesn't slow down the chat response.

Add a helper function at the top of handler.ts:

```ts
async function persistFeedback(
  config: NonNullable<FeedbackHandlerConfig['supabase']>,
  messages: UIMessage[],
  testerName?: string,
) {
  // Dynamic import to keep @supabase/supabase-js optional
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(config.url, config.serviceRoleKey, {
    db: { schema: 'feedback_chat' },
  })

  // Use first user message content as session identifier
  const firstUserMsg = messages.find((m) => m.role === 'user')
  if (!firstUserMsg) return

  // Create a deterministic session ID from project + first message timestamp
  // Or use upsert pattern: find existing session for this project + tester within last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data: existing } = await supabase
    .from('feedback_sessions')
    .select('id, message_count')
    .eq('project_id', config.projectId)
    .eq('tester_name', testerName ?? 'Anonymous')
    .gte('last_message_at', oneHourAgo)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single()

  let sessionId: string

  if (existing) {
    sessionId = existing.id
    // Update session
    await supabase
      .from('feedback_sessions')
      .update({
        last_message_at: new Date().toISOString(),
        message_count: messages.filter((m) => m.role === 'user').length,
      })
      .eq('id', sessionId)
  } else {
    // Create new session
    const { data: newSession } = await supabase
      .from('feedback_sessions')
      .insert({
        project_id: config.projectId,
        tester_name: testerName ?? 'Anonymous',
        tester_id: testerName?.toLowerCase().replace(/\s+/g, '-') ?? 'anonymous',
        message_count: messages.filter((m) => m.role === 'user').length,
      })
      .select('id')
      .single()

    if (!newSession) return
    sessionId = newSession.id
  }

  // Upsert messages — only insert new ones
  // Get existing message count to know what's new
  const { count } = await supabase
    .from('feedback_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)

  const existingCount = count ?? 0
  const newMessages = messages.slice(existingCount)

  if (newMessages.length > 0) {
    const rows = newMessages.map((m) => ({
      session_id: sessionId,
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string'
        ? m.content
        : m.parts?.filter((p: { type: string }) => p.type === 'text').map((p: { text: string }) => p.text).join('\n') ?? '',
      created_at: new Date().toISOString(),
    }))
    await supabase.from('feedback_messages').insert(rows)
  }
}
```

**Step 3: Call persistence in the POST handler**

After the `streamText` call, before returning, fire off persistence:

```ts
// Fire-and-forget persistence
if (config.supabase) {
  // Extract tester name from the last user message metadata or use default
  persistFeedback(config.supabase, messages).catch(() => {
    // Silent failure — persistence should not break the chat
  })
}
```

**Step 4: Export the new config type from index.ts**

No changes needed — `FeedbackHandlerConfig` is already exported.

**Step 5: Commit**

```bash
git add packages/widget/src/server/handler.ts
git commit -m "feat(widget): add optional Supabase feedback persistence to chat handler"
```

---

### Task 4: Dashboard API — Feedback Data Endpoints

**Files:**
- Create: `packages/dashboard/src/app/api/feedback/[projectId]/route.ts`
- Create: `packages/dashboard/src/app/api/feedback/[projectId]/classify/route.ts`
- Create: `packages/dashboard/src/app/api/feedback/[projectId]/digest/route.ts`
- Create: `packages/dashboard/src/app/api/feedback/[projectId]/[sessionId]/route.ts`

**Step 1: List sessions endpoint**

`/api/feedback/[projectId]/route.ts` — GET returns all feedback sessions for a project:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  const url = new URL(request.url)
  const theme = url.searchParams.get('theme')
  const tester = url.searchParams.get('tester')
  const status = url.searchParams.get('status')

  let query = supabase
    .from('feedback_sessions')
    .select('*')
    .eq('project_id', projectId)
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)
  if (tester) query = query.eq('tester_id', tester)
  if (theme) query = query.contains('ai_themes', [theme])

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
```

**Step 2: Session detail endpoint (messages)**

`/api/feedback/[projectId]/[sessionId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sessionId: string }> }
) {
  const { sessionId } = await params
  const supabase = await createClient()

  const { data: messages, error } = await supabase
    .from('feedback_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(messages)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sessionId: string }> }
) {
  const { sessionId } = await params
  const supabase = await createClient()
  const body = await request.json()

  const { error } = await supabase
    .from('feedback_sessions')
    .update({ status: body.status })
    .eq('id', sessionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

**Step 3: Classify endpoint (AI theme tagging)**

`/api/feedback/[projectId]/classify/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'

const THEME_COLORS = [
  '#5e9eff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()
  const { sessionId } = await request.json()

  // Fetch session + messages
  const { data: messages } = await supabase
    .from('feedback_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: 'No messages' }, { status: 400 })
  }

  // Fetch existing themes for this project
  const { data: existingThemes } = await supabase
    .from('feedback_themes')
    .select('id, name')
    .eq('project_id', projectId)

  const themeList = (existingThemes ?? []).map((t) => t.name).join(', ')

  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')

  const model = createAnthropic()('claude-haiku-4-5-20251001')

  const { object } = await generateObject({
    model,
    schema: z.object({
      summary: z.string().describe('One-line summary of the feedback (max 100 chars)'),
      themes: z.array(z.string()).min(1).max(3).describe('Theme names — reuse existing themes when applicable'),
      app_area: z.string().describe('Which part of the app this feedback relates to'),
    }),
    prompt: `Analyze this user feedback conversation and extract:
1. A concise one-line summary
2. 1-3 theme tags (reuse from existing themes when they match: ${themeList || 'none yet'})
3. Which area of the app this relates to

Conversation:
${conversationText}`,
  })

  // Upsert themes
  const themeIds: string[] = []
  for (const themeName of object.themes) {
    const existing = (existingThemes ?? []).find(
      (t) => t.name.toLowerCase() === themeName.toLowerCase()
    )
    if (existing) {
      themeIds.push(existing.id)
      await supabase
        .from('feedback_themes')
        .update({
          message_count: (existingThemes ?? []).find((t) => t.id === existing.id)!.message_count + 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      const colorIndex = (existingThemes?.length ?? 0) + themeIds.length
      const { data: newTheme } = await supabase
        .from('feedback_themes')
        .insert({
          project_id: projectId,
          name: themeName,
          description: object.app_area,
          color: THEME_COLORS[colorIndex % THEME_COLORS.length],
          message_count: 1,
        })
        .select('id')
        .single()
      if (newTheme) themeIds.push(newTheme.id)
    }
  }

  // Update session with AI results
  await supabase
    .from('feedback_sessions')
    .update({
      ai_summary: object.summary,
      ai_themes: themeIds,
    })
    .eq('id', sessionId)

  return NextResponse.json({ summary: object.summary, themes: object.themes, themeIds })
}
```

**Step 4: Digest endpoint**

`/api/feedback/[projectId]/digest/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  const url = new URL(request.url)
  const period = url.searchParams.get('period') ?? 'week'
  const since = new Date()
  since.setDate(since.getDate() - (period === 'day' ? 1 : 7))

  // Fetch recent sessions
  const { data: sessions } = await supabase
    .from('feedback_sessions')
    .select('ai_summary, ai_themes, status, tester_name')
    .eq('project_id', projectId)
    .gte('started_at', since.toISOString())

  // Fetch themes
  const { data: themes } = await supabase
    .from('feedback_themes')
    .select('id, name, message_count')
    .eq('project_id', projectId)
    .order('message_count', { ascending: false })

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({
      digest: 'No feedback received this period.',
      stats: { total: 0, needsAttention: 0, resolved: 0 },
      topThemes: [],
    })
  }

  const total = sessions.length
  const needsAttention = sessions.filter((s) => s.status === 'open').length
  const resolved = sessions.filter((s) => s.status === 'resolved').length
  const summaries = sessions
    .filter((s) => s.ai_summary)
    .map((s) => `- ${s.ai_summary} (${s.status})`)
    .join('\n')

  const themeMap = (themes ?? []).reduce(
    (acc, t) => ({ ...acc, [t.id]: t.name }),
    {} as Record<string, string>
  )

  const model = createAnthropic()('claude-haiku-4-5-20251001')

  const { text } = await generateText({
    model,
    prompt: `Generate a brief digest (3-5 sentences) summarizing this feedback activity for a solo founder:

Total conversations: ${total}
Needs attention: ${needsAttention}
Resolved: ${resolved}
Top themes: ${(themes ?? []).slice(0, 5).map((t) => `${t.name} (${t.message_count})`).join(', ')}

Feedback summaries:
${summaries}

Be specific about what testers are saying. Mention blind spots if obvious. Keep it actionable.`,
  })

  const topThemes = (themes ?? []).slice(0, 5).map((t) => ({
    id: t.id,
    name: t.name,
    count: t.message_count,
  }))

  return NextResponse.json({
    digest: text,
    stats: { total, needsAttention, resolved },
    topThemes,
  })
}
```

**Step 5: Commit**

```bash
git add packages/dashboard/src/app/api/feedback/
git commit -m "feat(dashboard): add feedback list, detail, classify, and digest API routes"
```

---

### Task 5: Dashboard — Add `@ai-sdk/anthropic` + `ai` + `zod` Dependencies

**Files:**
- Modify: `packages/dashboard/package.json`

The classify and digest endpoints use `@ai-sdk/anthropic`, `ai`, and `zod`. These need to be added to the dashboard's dependencies.

**Step 1: Install dependencies**

```bash
cd packages/dashboard && npm install @ai-sdk/anthropic ai zod
```

**Step 2: Verify `package.json` updated correctly**

Check that `@ai-sdk/anthropic`, `ai`, and `zod` appear in `dependencies`.

**Step 3: Commit**

```bash
git add packages/dashboard/package.json ../../package-lock.json
git commit -m "feat(dashboard): add ai-sdk, anthropic, and zod dependencies for feedback classification"
```

---

### Task 6: Dashboard Component — Feedback Session List

**Files:**
- Create: `packages/dashboard/src/components/feedback-list.tsx`

**Step 1: Create the component**

A client component that fetches and displays feedback sessions with theme pills and status indicators. Reuses the glassmorphism card pattern from `runs-table.tsx`.

```tsx
'use client'

import { useState, useEffect } from 'react'
import { MessageCircle } from 'lucide-react'
import type { FeedbackSession, FeedbackTheme } from '@/lib/types'

type Props = {
  projectId: string
  themes: FeedbackTheme[]
  onSelectSession: (session: FeedbackSession) => void
}

const STATUS_INDICATOR: Record<string, { dot: string; label: string }> = {
  open: { dot: 'bg-success', label: 'Open' },
  in_progress: { dot: 'bg-amber-400', label: 'In progress' },
  resolved: { dot: 'bg-success', label: 'Resolved' },
  dismissed: { dot: 'bg-muted', label: 'Dismissed' },
}

export function FeedbackList({ projectId, themes, onSelectSession }: Props) {
  const [sessions, setSessions] = useState<FeedbackSession[]>([])
  const [activeTheme, setActiveTheme] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams()
    if (activeTheme) params.set('theme', activeTheme)

    fetch(`/api/feedback/${projectId}?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setSessions(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [projectId, activeTheme])

  const themeMap = Object.fromEntries(themes.map((t) => [t.id, t]))

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-20 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Theme pills */}
      {themes.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTheme(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !activeTheme
                ? 'bg-accent/20 text-accent'
                : 'bg-surface text-muted hover:bg-surface-hover hover:text-fg'
            }`}
          >
            All ({sessions.length})
          </button>
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setActiveTheme(activeTheme === theme.id ? null : theme.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeTheme === theme.id
                  ? 'text-fg'
                  : 'bg-surface text-muted hover:bg-surface-hover hover:text-fg'
              }`}
              style={
                activeTheme === theme.id
                  ? { backgroundColor: `${theme.color}33` }
                  : undefined
              }
            >
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: theme.color }}
              />
              {theme.name} ({theme.message_count})
            </button>
          ))}
        </div>
      )}

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="glass-card px-5 py-10 text-center">
          <MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted" />
          <p className="text-sm text-muted">
            No feedback conversations yet. They will appear here once testers start using the widget.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const indicator = STATUS_INDICATOR[session.status] ?? STATUS_INDICATOR.open
            const sessionThemes = (session.ai_themes ?? [])
              .map((id) => themeMap[id])
              .filter(Boolean)

            return (
              <button
                key={session.id}
                onClick={() => onSelectSession(session)}
                className="glass-card flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:border-white/[0.14]"
              >
                {/* Status dot */}
                <div className="mt-1.5 flex shrink-0">
                  {session.status === 'resolved' ? (
                    <span className="text-success text-xs">✓</span>
                  ) : (
                    <span className={`h-2 w-2 rounded-full ${indicator.dot}`} />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">
                    {session.ai_summary ?? `Conversation with ${session.tester_name ?? 'Anonymous'}`}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span>{session.tester_name ?? 'Anonymous'}</span>
                    <span>·</span>
                    <span>{timeAgo(session.last_message_at)}</span>
                    {sessionThemes.length > 0 && (
                      <>
                        <span>·</span>
                        {sessionThemes.map((t) => (
                          <span
                            key={t.id}
                            className="rounded-full px-1.5 py-0.5 text-[10px]"
                            style={{ backgroundColor: `${t.color}20`, color: t.color }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Message count */}
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {session.message_count} msg
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/components/feedback-list.tsx
git commit -m "feat(dashboard): add feedback session list component with theme pills"
```

---

### Task 7: Dashboard Component — Feedback Slide-Over (Thread View)

**Files:**
- Create: `packages/dashboard/src/components/feedback-slide-over.tsx`

**Step 1: Create the component**

Reuses the slide-over pattern from `run-slide-over.tsx`. Shows the full message thread + actions.

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, ExternalLink, Check, XIcon, Sparkles } from 'lucide-react'
import type { FeedbackSession, FeedbackMessage, FeedbackTheme } from '@/lib/types'

type Props = {
  session: FeedbackSession
  themes: FeedbackTheme[]
  projectId: string
  githubRepo: string
  onClose: () => void
  onStatusChange: (sessionId: string, status: string) => void
}

export function FeedbackSlideOver({ session, themes, projectId, githubRepo, onClose, onStatusChange }: Props) {
  const [messages, setMessages] = useState<FeedbackMessage[]>([])
  const [classifying, setClassifying] = useState(false)

  useEffect(() => {
    fetch(`/api/feedback/${projectId}/${session.id}`)
      .then((res) => res.json())
      .then(setMessages)
      .catch(() => {})
  }, [projectId, session.id])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleClassify = async () => {
    setClassifying(true)
    try {
      await fetch(`/api/feedback/${projectId}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      })
    } catch { /* silent */ }
    setClassifying(false)
  }

  const handleStatusChange = async (status: string) => {
    await fetch(`/api/feedback/${projectId}/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    onStatusChange(session.id, status)
  }

  const themeMap = Object.fromEntries(themes.map((t) => [t.id, t]))
  const sessionThemes = (session.ai_themes ?? []).map((id) => themeMap[id]).filter(Boolean)

  return (
    <>
      <div className="slide-over-backdrop" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 flex h-screen w-full max-w-[480px] flex-col border-l border-edge bg-bg/95 backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-6 py-4">
          <div>
            <p className="text-sm font-medium text-fg">
              {session.tester_name ?? 'Anonymous'}
            </p>
            <p className="text-xs text-muted">{session.message_count} messages</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* AI summary */}
        {session.ai_summary && (
          <div className="border-b border-edge px-6 py-3">
            <p className="text-xs text-muted">AI Summary</p>
            <p className="mt-0.5 text-sm text-fg">{session.ai_summary}</p>
            {sessionThemes.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                {sessionThemes.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: `${t.color}20`, color: t.color }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-xl px-3.5 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'ml-8 bg-accent/10 text-fg'
                  : 'mr-8 bg-surface text-fg'
              }`}
            >
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                {msg.role === 'user' ? session.tester_name ?? 'Tester' : 'AI'}
              </p>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}
        </div>

        {/* GitHub issue link */}
        {session.github_issue_number && (
          <div className="border-t border-edge px-6 py-3">
            <a
              href={`https://github.com/${githubRepo}/issues/${session.github_issue_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-accent hover:text-accent/80"
            >
              Issue #{session.github_issue_number}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t border-edge px-6 py-4">
          {!session.ai_summary && (
            <button
              onClick={handleClassify}
              disabled={classifying}
              className="flex h-9 items-center gap-2 rounded-xl bg-accent/10 px-4 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {classifying ? 'Classifying...' : 'Classify'}
            </button>
          )}
          {session.status === 'open' && (
            <>
              <button
                onClick={() => handleStatusChange('resolved')}
                className="flex h-9 items-center gap-2 rounded-xl bg-success/10 px-4 text-xs font-medium text-success transition-colors hover:bg-success/20"
              >
                <Check className="h-3.5 w-3.5" />
                Resolve
              </button>
              <button
                onClick={() => handleStatusChange('dismissed')}
                className="flex h-9 items-center gap-2 rounded-xl bg-surface px-4 text-xs font-medium text-muted transition-colors hover:bg-surface-hover"
              >
                <XIcon className="h-3.5 w-3.5" />
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/components/feedback-slide-over.tsx
git commit -m "feat(dashboard): add feedback thread slide-over with classify and status actions"
```

---

### Task 8: Dashboard Component — Digest Card

**Files:**
- Create: `packages/dashboard/src/components/digest-card.tsx`

**Step 1: Create the component**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'

type DigestData = {
  digest: string
  stats: { total: number; needsAttention: number; resolved: number }
  topThemes: { id: string; name: string; count: number }[]
}

export function DigestCard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'day' | 'week'>('week')

  const fetchDigest = () => {
    setLoading(true)
    fetch(`/api/feedback/${projectId}/digest?period=${period}`)
      .then((res) => res.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchDigest()
  }, [projectId, period])

  if (loading) {
    return <div className="skeleton h-32 w-full rounded-xl" />
  }

  if (!data || data.stats.total === 0) {
    return (
      <div className="glass-card px-5 py-4">
        <div className="flex items-center gap-2 text-muted">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Digest</span>
        </div>
        <p className="mt-2 text-sm text-muted">No feedback this {period}.</p>
      </div>
    )
  }

  return (
    <div className="glass-card px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">AI Digest</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-surface text-[10px]">
            <button
              onClick={() => setPeriod('day')}
              className={`rounded-lg px-2 py-1 transition-colors ${
                period === 'day' ? 'bg-elevated text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={`rounded-lg px-2 py-1 transition-colors ${
                period === 'week' ? 'bg-elevated text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              Week
            </button>
          </div>
          <button
            onClick={fetchDigest}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex gap-4 text-xs">
        <span className="text-fg">
          <span className="text-lg font-semibold tabular-nums">{data.stats.total}</span>{' '}
          <span className="text-muted">conversations</span>
        </span>
        <span className="text-fg">
          <span className="text-lg font-semibold tabular-nums text-amber-400">{data.stats.needsAttention}</span>{' '}
          <span className="text-muted">need attention</span>
        </span>
        <span className="text-fg">
          <span className="text-lg font-semibold tabular-nums text-success">{data.stats.resolved}</span>{' '}
          <span className="text-muted">resolved</span>
        </span>
      </div>

      {/* AI digest text */}
      <p className="mt-3 text-sm leading-relaxed text-fg/90">{data.digest}</p>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/components/digest-card.tsx
git commit -m "feat(dashboard): add AI digest card component with day/week toggle"
```

---

### Task 9: Dashboard Component — Tester Activity View

**Files:**
- Create: `packages/dashboard/src/components/tester-activity.tsx`

**Step 1: Create the component**

```tsx
'use client'

import { Users } from 'lucide-react'
import type { TesterSummary } from '@/lib/types'

type Props = {
  testers: TesterSummary[]
  onSelectTester: (testerId: string) => void
}

export function TesterActivity({ testers, onSelectTester }: Props) {
  if (testers.length === 0) {
    return (
      <div className="glass-card px-5 py-10 text-center">
        <Users className="mx-auto mb-3 h-8 w-8 text-muted" />
        <p className="text-sm text-muted">No tester activity yet.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        {testers.length} tester{testers.length !== 1 ? 's' : ''} active
      </p>
      <div className="space-y-2">
        {testers.map((tester) => {
          const rate = tester.total_count > 0
            ? Math.round((tester.resolved_count / tester.total_count) * 100)
            : 0

          return (
            <button
              key={tester.tester_id}
              onClick={() => onSelectTester(tester.tester_id)}
              className="glass-card flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:border-white/[0.14]"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">
                  {tester.tester_name ?? tester.tester_id}
                </span>
                <span className="text-xs tabular-nums text-muted">
                  {tester.session_count} conversations
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted">
                <span>Last active {timeAgo(tester.last_active)}</span>
                {tester.top_themes.length > 0 && (
                  <>
                    <span>·</span>
                    {tester.top_themes.slice(0, 3).map((t) => (
                      <span
                        key={t.name}
                        className="rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ backgroundColor: `${t.color}20`, color: t.color }}
                      >
                        {t.name} ({t.count})
                      </span>
                    ))}
                  </>
                )}
              </div>

              {/* Resolution bar */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-success transition-all duration-500"
                    style={{ width: `${rate}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-muted">{rate}% resolved</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/components/tester-activity.tsx
git commit -m "feat(dashboard): add tester activity view component with resolution bars"
```

---

### Task 10: Dashboard API — Tester Summary Endpoint

**Files:**
- Create: `packages/dashboard/src/app/api/feedback/[projectId]/testers/route.ts`

**Step 1: Create the endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  // Fetch all sessions grouped by tester
  const { data: sessions } = await supabase
    .from('feedback_sessions')
    .select('tester_id, tester_name, status, last_message_at, ai_themes')
    .eq('project_id', projectId)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json([])
  }

  // Fetch themes for mapping
  const { data: themes } = await supabase
    .from('feedback_themes')
    .select('id, name, color')
    .eq('project_id', projectId)

  const themeMap = Object.fromEntries((themes ?? []).map((t) => [t.id, t]))

  // Group by tester
  const testerMap = new Map<string, {
    tester_id: string
    tester_name: string | null
    sessions: typeof sessions
  }>()

  for (const s of sessions) {
    const id = s.tester_id ?? 'anonymous'
    if (!testerMap.has(id)) {
      testerMap.set(id, {
        tester_id: id,
        tester_name: s.tester_name,
        sessions: [],
      })
    }
    testerMap.get(id)!.sessions.push(s)
  }

  // Build summaries
  const summaries = Array.from(testerMap.values()).map((t) => {
    const themeCounts = new Map<string, { name: string; color: string; count: number }>()
    for (const s of t.sessions) {
      for (const themeId of s.ai_themes ?? []) {
        const theme = themeMap[themeId]
        if (theme) {
          const existing = themeCounts.get(themeId)
          if (existing) existing.count++
          else themeCounts.set(themeId, { name: theme.name, color: theme.color, count: 1 })
        }
      }
    }

    const lastActive = t.sessions.reduce(
      (latest, s) => (s.last_message_at > latest ? s.last_message_at : latest),
      ''
    )

    return {
      tester_id: t.tester_id,
      tester_name: t.tester_name,
      session_count: t.sessions.length,
      last_active: lastActive,
      top_themes: Array.from(themeCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      resolved_count: t.sessions.filter((s) => s.status === 'resolved').length,
      total_count: t.sessions.length,
    }
  })

  summaries.sort((a, b) => b.session_count - a.session_count)

  return NextResponse.json(summaries)
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/app/api/feedback/[projectId]/testers/route.ts
git commit -m "feat(dashboard): add tester summary API endpoint"
```

---

### Task 11: Dashboard Page — Feedback Page

**Files:**
- Create: `packages/dashboard/src/app/projects/[id]/feedback/page.tsx`

**Step 1: Create the page**

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FeedbackPageClient } from './client'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, github_repo')
    .eq('id', id)
    .single()

  if (!project) notFound()

  // Fetch themes server-side for initial render
  const { data: themes } = await supabase
    .from('feedback_themes')
    .select('*')
    .eq('project_id', id)
    .order('message_count', { ascending: false })

  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 pb-16">
      <Link
        href={`/projects/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3 w-3" />
        {project.name}
      </Link>

      <h1 className="mb-8 text-lg font-medium text-fg">Feedback</h1>

      <FeedbackPageClient
        projectId={project.id}
        githubRepo={project.github_repo}
        themes={themes ?? []}
      />
    </div>
  )
}
```

**Step 2: Create the client wrapper**

Create: `packages/dashboard/src/app/projects/[id]/feedback/client.tsx`

```tsx
'use client'

import { useState, useEffect } from 'react'
import { DigestCard } from '@/components/digest-card'
import { FeedbackList } from '@/components/feedback-list'
import { FeedbackSlideOver } from '@/components/feedback-slide-over'
import { TesterActivity } from '@/components/tester-activity'
import type { FeedbackSession, FeedbackTheme, TesterSummary } from '@/lib/types'

type Tab = 'feedback' | 'testers'

type Props = {
  projectId: string
  githubRepo: string
  themes: FeedbackTheme[]
}

export function FeedbackPageClient({ projectId, githubRepo, themes }: Props) {
  const [tab, setTab] = useState<Tab>('feedback')
  const [selectedSession, setSelectedSession] = useState<FeedbackSession | null>(null)
  const [testers, setTesters] = useState<TesterSummary[]>([])

  useEffect(() => {
    if (tab === 'testers') {
      fetch(`/api/feedback/${projectId}/testers`)
        .then((res) => res.json())
        .then(setTesters)
        .catch(() => {})
    }
  }, [tab, projectId])

  const handleStatusChange = (sessionId: string, status: string) => {
    setSelectedSession(null)
    // Optimistic: caller can re-fetch
  }

  const handleSelectTester = (testerId: string) => {
    // Switch to feedback tab filtered by tester
    setTab('feedback')
    // The FeedbackList will need to accept a tester filter — handled via URL param or state
  }

  return (
    <div>
      {/* Digest */}
      <div className="mb-6">
        <DigestCard projectId={projectId} />
      </div>

      {/* Tab toggle */}
      <div className="mb-4 flex gap-1 rounded-xl bg-surface p-1">
        <button
          onClick={() => setTab('feedback')}
          className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
            tab === 'feedback'
              ? 'bg-elevated text-fg'
              : 'text-muted hover:text-fg'
          }`}
        >
          Conversations
        </button>
        <button
          onClick={() => setTab('testers')}
          className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
            tab === 'testers'
              ? 'bg-elevated text-fg'
              : 'text-muted hover:text-fg'
          }`}
        >
          Testers
        </button>
      </div>

      {/* Content */}
      {tab === 'feedback' ? (
        <FeedbackList
          projectId={projectId}
          themes={themes}
          onSelectSession={setSelectedSession}
        />
      ) : (
        <TesterActivity
          testers={testers}
          onSelectTester={handleSelectTester}
        />
      )}

      {/* Slide-over */}
      {selectedSession && (
        <FeedbackSlideOver
          session={selectedSession}
          themes={themes}
          projectId={projectId}
          githubRepo={githubRepo}
          onClose={() => setSelectedSession(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add packages/dashboard/src/app/projects/[id]/feedback/
git commit -m "feat(dashboard): add feedback intelligence hub page with digest, list, and tester tabs"
```

---

### Task 12: Dashboard — Add Feedback Link to Sidebar

**Files:**
- Modify: `packages/dashboard/src/components/sidebar.tsx`

**Step 1: Add Feedback nav item**

Add a new navigation link between Projects and the divider. Import `MessageSquare` from lucide-react (distinct from the existing `MessageSquareText` used for the logo).

The sidebar currently only has a "Projects" link. Add a "Feedback" link that's contextual — it should only appear when viewing a project (extract projectId from the pathname).

Add after the Projects `<Link>` and before the divider:

```tsx
{/* Feedback — only visible when viewing a project */}
{projectId && (
  <Link
    href={`/projects/${projectId}/feedback`}
    className={`flex items-center rounded-[16px] transition-colors ${
      pathname.includes('/feedback')
        ? 'bg-white/[0.08] text-fg'
        : 'text-muted hover:bg-white/[0.06] hover:text-fg'
    } ${expanded ? 'gap-2.5 px-2 py-2' : 'justify-center p-1.5'}`}
  >
    <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center">
      <MessageSquare className="h-[15px] w-[15px]" />
    </div>
    {expanded && <span className="truncate text-xs">Feedback</span>}
  </Link>
)}
```

Extract `projectId` from pathname at the top of the component:

```ts
const projectMatch = pathname.match(/\/projects\/([^/]+)/)
const projectId = projectMatch ? projectMatch[1] : null
```

Import `MessageSquare` alongside the existing imports.

**Step 2: Commit**

```bash
git add packages/dashboard/src/components/sidebar.tsx
git commit -m "feat(dashboard): add contextual Feedback link to sidebar"
```

---

### Task 13: Dashboard — Add Digest Summary to Project Page

**Files:**
- Modify: `packages/dashboard/src/app/projects/[id]/page.tsx`

**Step 1: Import and render the DigestCard**

Add the `DigestCard` component to the project detail page, between the `StatsBar` and `SetupChecklist`:

```tsx
import { DigestCard } from '@/components/digest-card'
```

Add after `<StatsBar runs={runs ?? []} />`:

```tsx
{/* Feedback digest */}
<div className="mb-8">
  <DigestCard projectId={project.id} />
</div>
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/app/projects/[id]/page.tsx
git commit -m "feat(dashboard): add feedback digest card to project dashboard page"
```

---

### Task 14: Build Verification

**Step 1: Run TypeScript check on the dashboard**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: 0 errors. Fix any type issues.

**Step 2: Run the build**

```bash
cd /path/to/feedback-chat && npm run build
```

Expected: Both widget and dashboard build successfully.

**Step 3: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix(dashboard): resolve build issues from feedback intelligence hub"
```

---

### Task 15: Final Review and Cleanup

**Step 1: Review all new files for consistency**

- Verify glassmorphism styling matches existing components
- Verify all API routes handle errors properly
- Verify Supabase queries use the `feedback_chat` schema (inherited from client config)
- Verify slide-over pattern matches `run-slide-over.tsx`

**Step 2: Run git log to verify commit history is clean**

```bash
git log --oneline main..HEAD
```

**Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(dashboard): cleanup feedback intelligence hub implementation"
```

---

## Summary of Changes

| Area | Files Created | Files Modified |
|------|--------------|----------------|
| Migration | 1 (SQL) | 0 |
| Types | 0 | 1 (types.ts) |
| Widget | 0 | 1 (handler.ts) |
| Dashboard API | 5 routes | 0 |
| Dashboard Components | 4 | 0 |
| Dashboard Pages | 2 (page + client) | 1 (project page) |
| Dashboard Nav | 0 | 1 (sidebar.tsx) |
| Dependencies | 0 | 1 (package.json) |
| **Total** | **12 new files** | **4 modified files** |
