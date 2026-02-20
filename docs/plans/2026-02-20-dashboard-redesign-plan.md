# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Settings page (product context, strategic nudges, setup config), enhance the Proposals page (idea box, user proposals), and clean up the Overview page.

**Architecture:** New Settings page at `/projects/[id]/settings` with server + client components. New `user_ideas` table and `strategic_nudges` column on `projects`. Four new API routes. Modified strategize worker to read nudges and user ideas.

**Tech Stack:** Next.js 15 (app router, async params), Supabase (feedback_chat schema), Tailwind CSS (glass-card pattern), Claude Haiku API, lucide-react icons.

---

### Task 1: Database Migration

**Files:**
- Create: `packages/dashboard/supabase/migrations/00012_settings_and_ideas.sql`

**Step 1: Write the migration**

```sql
-- Add strategic nudges to projects
ALTER TABLE feedback_chat.projects
ADD COLUMN IF NOT EXISTS strategic_nudges text[] DEFAULT '{}';

-- User-submitted ideas for the strategize pipeline
CREATE TABLE IF NOT EXISTS feedback_chat.user_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES feedback_chat.projects(id) ON DELETE CASCADE,
  text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'incorporated', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_ideas_project
  ON feedback_chat.user_ideas(project_id, status, created_at DESC);

ALTER TABLE feedback_chat.user_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_ideas_all_own_project"
  ON feedback_chat.user_ideas
  FOR ALL USING (project_id IN (SELECT id FROM feedback_chat.projects WHERE user_id = auth.uid()));
```

**Step 2: Apply the migration to Supabase**

Run via Supabase MCP `execute_sql` tool against project `lilcfbtohnhegxmpcfpb` or via:
```bash
cd packages/dashboard && npx supabase db push
```

**Step 3: Verify**

Run SQL to confirm:
```sql
SELECT column_name FROM information_schema.columns WHERE table_schema = 'feedback_chat' AND table_name = 'projects' AND column_name = 'strategic_nudges';
SELECT table_name FROM information_schema.tables WHERE table_schema = 'feedback_chat' AND table_name = 'user_ideas';
```

**Step 4: Commit**

```bash
git add packages/dashboard/supabase/migrations/00012_settings_and_ideas.sql
git commit -m "feat: add strategic_nudges column and user_ideas table"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `packages/dashboard/src/lib/types.ts`

**Step 1: Add the UserIdea type**

After the `StrategyMemoryEvent` type (line 160), add:

```typescript
export type UserIdea = {
  id: string
  project_id: string
  text: string
  status: 'pending' | 'incorporated' | 'dismissed'
  created_at: string
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/lib/types.ts
git commit -m "feat: add UserIdea type"
```

---

### Task 3: Ideas API Route

**Files:**
- Create: `packages/dashboard/src/app/api/ideas/[projectId]/route.ts`

**Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')

  let query = supabase
    .from('user_ideas')
    .select('*')
    .eq('project_id', projectId)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ideas: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()
  const body = await request.json()

  const { text } = body as { text: string }
  if (!text?.trim()) {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('user_ideas')
    .insert({ project_id: projectId, text: text.trim() })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ idea: data })
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/app/api/ideas/[projectId]/route.ts
git commit -m "feat: add ideas API route (GET + POST)"
```

---

### Task 4: Settings API Route

**Files:**
- Create: `packages/dashboard/src/app/api/projects/[id]/settings/route.ts`

**Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project, error } = await supabase
    .from('projects')
    .select('product_context, strategic_nudges')
    .eq('id', id)
    .single()

  if (error || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json(project)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const body = await request.json()

  const updates: Record<string, unknown> = {}

  if ('product_context' in body) {
    updates.product_context = body.product_context
  }
  if ('strategic_nudges' in body) {
    updates.strategic_nudges = body.strategic_nudges
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/app/api/projects/[id]/settings/route.ts
git commit -m "feat: add settings API route (GET + PATCH)"
```

---

### Task 5: Product Context Generation API

**Files:**
- Create: `packages/dashboard/src/app/api/projects/[id]/context/generate/route.ts`

This route fetches repo data from GitHub and generates a product summary with Haiku.

**Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { App } from '@octokit/app'
import Anthropic from '@anthropic-ai/sdk'

function getGitHubApp(): App {
  return new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Get project + installation
  const { data: project, error: fetchErr } = await supabase
    .from('projects')
    .select('github_repo, github_installation_id')
    .eq('id', id)
    .single()

  if (fetchErr || !project?.github_repo || !project?.github_installation_id) {
    return NextResponse.json(
      { error: 'Project not found or no GitHub repo configured' },
      { status: 400 }
    )
  }

  const [owner, repo] = project.github_repo.split('/')
  if (!owner || !repo) {
    return NextResponse.json({ error: 'Invalid github_repo format' }, { status: 400 })
  }

  // 2. Get installation octokit
  const app = getGitHubApp()
  const octokit = await app.getInstallationOctokit(project.github_installation_id)

  // 3. Fetch repo data in parallel
  const [readmeRes, pkgRes, issuesRes, repoRes] = await Promise.allSettled([
    octokit.request('GET /repos/{owner}/{repo}/readme', { owner, repo, mediaType: { format: 'raw' } }),
    octokit.request('GET /repos/{owner}/{repo}/contents/package.json', { owner, repo, mediaType: { format: 'raw' } }),
    octokit.request('GET /repos/{owner}/{repo}/issues', { owner, repo, per_page: 20, state: 'all', sort: 'created', direction: 'desc' }),
    octokit.request('GET /repos/{owner}/{repo}', { owner, repo }),
  ])

  const readme = readmeRes.status === 'fulfilled' ? String(readmeRes.value.data).slice(0, 3000) : ''
  const pkgJson = pkgRes.status === 'fulfilled' ? String(pkgRes.value.data).slice(0, 1000) : ''
  const issues = issuesRes.status === 'fulfilled'
    ? (issuesRes.value.data as Array<{ title: string }>).map(i => `- ${i.title}`).join('\n')
    : ''
  const description = repoRes.status === 'fulfilled'
    ? (repoRes.value.data as { description: string | null }).description || ''
    : ''

  // 4. Generate summary with Haiku
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Summarize this GitHub repository in 2-3 paragraphs. Cover: what the product is, who it's for, the tech stack, and current development priorities based on recent issues.

Repository: ${owner}/${repo}
${description ? `Description: ${description}` : ''}

README (first 3000 chars):
${readme || 'No README found.'}

package.json (partial):
${pkgJson || 'Not found.'}

Recent issues:
${issues || 'No issues found.'}

Write in third person, present tense. Be concise and factual.`,
    }],
  })

  const summary = response.content[0].type === 'text' ? response.content[0].text : ''

  // 5. Save to project
  const { error: updateErr } = await supabase
    .from('projects')
    .update({ product_context: summary })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ product_context: summary })
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/src/app/api/projects/[id]/context/generate/route.ts
git commit -m "feat: add product context generation API (GitHub + Haiku)"
```

---

### Task 6: Settings Page (Server + Client)

**Files:**
- Create: `packages/dashboard/src/app/projects/[id]/settings/page.tsx`
- Create: `packages/dashboard/src/app/projects/[id]/settings/client.tsx`

**Step 1: Write the server page**

```typescript
// packages/dashboard/src/app/projects/[id]/settings/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { SetupStatus } from '@/lib/types'
import { SettingsPageClient } from './client'

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ apiKey?: string }>
}) {
  const { id } = await params
  const { apiKey } = await searchParams
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, github_repo, product_context, strategic_nudges, webhook_secret, github_installation_id, setup_status, setup_pr_url, setup_error, setup_progress')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const hasRuns = !!(await supabase
    .from('pipeline_runs')
    .select('id')
    .eq('project_id', id)
    .limit(1)
    .single()).data

  const agentUrl = process.env.AGENT_URL ?? ''
  const webhookUrl = agentUrl ? `${agentUrl}/webhook/github` : ''

  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 pb-16">
      <Link
        href={`/projects/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3 w-3" />
        {project.name}
      </Link>

      <h1 className="mb-8 text-lg font-medium text-fg">Settings</h1>

      <SettingsPageClient
        projectId={project.id}
        githubRepo={project.github_repo ?? ''}
        installationId={project.github_installation_id ?? null}
        initialContext={project.product_context ?? ''}
        initialNudges={(project.strategic_nudges ?? []) as string[]}
        initialSetupStatus={(project.setup_status ?? 'pending') as SetupStatus}
        initialPrUrl={project.setup_pr_url ?? null}
        initialError={project.setup_error ?? null}
        webhookSecret={project.webhook_secret ?? ''}
        apiKey={apiKey}
        webhookUrl={webhookUrl}
        agentUrl={agentUrl}
        setupProgress={(project.setup_progress ?? {}) as Record<string, boolean>}
        hasRuns={hasRuns}
      />
    </div>
  )
}
```

**Step 2: Write the client component**

```typescript
// packages/dashboard/src/app/projects/[id]/settings/client.tsx
'use client'

import { useCallback, useState } from 'react'
import { Brain, Compass, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { SetupSection } from '@/components/setup-section'
import type { SetupStatus } from '@/lib/types'

type Props = {
  projectId: string
  githubRepo: string
  installationId: number | null
  initialContext: string
  initialNudges: string[]
  initialSetupStatus: SetupStatus
  initialPrUrl: string | null
  initialError: string | null
  webhookSecret: string
  apiKey?: string
  webhookUrl: string
  agentUrl: string
  setupProgress: Record<string, boolean>
  hasRuns: boolean
}

export function SettingsPageClient({
  projectId,
  githubRepo,
  installationId,
  initialContext,
  initialNudges,
  initialSetupStatus,
  initialPrUrl,
  initialError,
  webhookSecret,
  apiKey,
  webhookUrl,
  agentUrl,
  setupProgress,
  hasRuns,
}: Props) {
  // Product context state
  const [context, setContext] = useState(initialContext)
  const [editingContext, setEditingContext] = useState(false)
  const [contextDraft, setContextDraft] = useState(initialContext)
  const [generating, setGenerating] = useState(false)
  const [savingContext, setSavingContext] = useState(false)

  // Nudges state
  const [nudges, setNudges] = useState(initialNudges)
  const [newNudge, setNewNudge] = useState('')
  const [savingNudges, setSavingNudges] = useState(false)

  const generateContext = useCallback(async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/context/generate`, { method: 'POST' })
      if (res.ok) {
        const json = await res.json()
        setContext(json.product_context)
        setContextDraft(json.product_context)
      }
    } finally {
      setGenerating(false)
    }
  }, [projectId])

  const saveContext = useCallback(async () => {
    setSavingContext(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_context: contextDraft }),
      })
      if (res.ok) {
        setContext(contextDraft)
        setEditingContext(false)
      }
    } finally {
      setSavingContext(false)
    }
  }, [projectId, contextDraft])

  const saveNudges = useCallback(async (updated: string[]) => {
    setSavingNudges(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategic_nudges: updated }),
      })
      if (res.ok) {
        setNudges(updated)
      }
    } finally {
      setSavingNudges(false)
    }
  }, [projectId])

  const addNudge = useCallback(() => {
    if (!newNudge.trim()) return
    const updated = [...nudges, newNudge.trim()]
    setNewNudge('')
    saveNudges(updated)
  }, [nudges, newNudge, saveNudges])

  const removeNudge = useCallback((index: number) => {
    const updated = nudges.filter((_, i) => i !== index)
    saveNudges(updated)
  }, [nudges, saveNudges])

  return (
    <div className="space-y-8">
      {/* Section 1: Product Context */}
      <div className="glass-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-fg">Product Context</h2>
          </div>
          <div className="flex items-center gap-2">
            {context && !editingContext && (
              <button
                onClick={() => { setContextDraft(context); setEditingContext(true) }}
                className="text-[11px] text-accent hover:text-fg"
              >
                Edit
              </button>
            )}
            <button
              onClick={generateContext}
              disabled={generating || !githubRepo}
              className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {context ? 'Regenerate' : 'Generate from GitHub'}
            </button>
          </div>
        </div>

        <p className="mb-3 text-xs text-muted">
          How the AI strategist understands your product. Auto-generated from your GitHub repo, or write your own.
        </p>

        {editingContext ? (
          <div>
            <textarea
              value={contextDraft}
              onChange={e => setContextDraft(e.target.value)}
              rows={6}
              className="w-full rounded-lg bg-white/[0.04] p-3 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Describe your product: what it is, who it's for, what matters most..."
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={saveContext}
                disabled={savingContext}
                className="rounded-lg bg-accent/20 px-3 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/30 disabled:opacity-50"
              >
                {savingContext ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditingContext(false); setContextDraft(context) }}
                className="text-[11px] text-muted hover:text-fg"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : context ? (
          <div className="rounded-lg bg-white/[0.04] p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{context}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/[0.08] p-4 text-center">
            <p className="text-xs text-muted">
              {githubRepo
                ? 'Click "Generate from GitHub" to auto-create your product context.'
                : 'Connect a GitHub repo first, or write your context manually.'}
            </p>
            {!githubRepo && (
              <button
                onClick={() => { setContextDraft(''); setEditingContext(true) }}
                className="mt-2 text-[11px] text-accent hover:text-fg"
              >
                Write manually
              </button>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Strategic Nudges */}
      <div className="glass-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Compass className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-fg">Strategic Nudges</h2>
        </div>

        <p className="mb-3 text-xs text-muted">
          Standing directives that guide all future proposal generation. The AI strategist treats these as high-priority constraints.
        </p>

        {nudges.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {nudges.map((nudge, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2"
              >
                <span className="text-sm text-fg">{nudge}</span>
                <button
                  onClick={() => removeNudge(i)}
                  disabled={savingNudges}
                  className="ml-2 rounded p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-fg disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newNudge}
            onChange={e => setNewNudge(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNudge() }}
            placeholder="e.g., Focus on mobile UX, Ignore performance for now..."
            className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={addNudge}
            disabled={!newNudge.trim() || savingNudges}
            className="flex items-center gap-1 rounded-lg bg-accent/10 px-3 py-2 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </div>

      {/* Section 3: Setup & Configuration (moved from Overview) */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-fg">Setup & Configuration</h2>
        <SetupSection
          projectId={projectId}
          githubRepo={githubRepo}
          installationId={installationId}
          initialStatus={initialSetupStatus}
          initialPrUrl={initialPrUrl}
          initialError={initialError}
          webhookSecret={webhookSecret}
          apiKey={apiKey}
          webhookUrl={webhookUrl}
          agentUrl={agentUrl}
          setupProgress={setupProgress}
          hasRuns={hasRuns}
        />
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add packages/dashboard/src/app/projects/[id]/settings/page.tsx packages/dashboard/src/app/projects/[id]/settings/client.tsx
git commit -m "feat: add Settings page with product context, nudges, and setup"
```

---

### Task 7: Add Settings to Sidebar

**Files:**
- Modify: `packages/dashboard/src/components/sidebar.tsx`

**Step 1: Add Settings icon import**

At line 6, add `Settings` to the lucide-react import:

```typescript
import { FolderKanban, LayoutDashboard, MessageSquare, Lightbulb, Workflow, Settings, LogOut } from 'lucide-react'
```

**Step 2: Add Settings link**

After the Pipeline link block (after line 120, before the divider at line 122), add:

```typescript
      {/* Settings (contextual — only when inside a project) */}
      {projectId && (
        <Link
          href={`/projects/${projectId}/settings`}
          className={`flex items-center rounded-[16px] transition-colors ${
            pathname.includes('/settings')
              ? 'bg-white/[0.08] text-fg'
              : 'text-muted hover:bg-white/[0.06] hover:text-fg'
          } ${expanded ? 'gap-2.5 px-2 py-2' : 'justify-center p-1.5'}`}
        >
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center">
            <Settings className="h-[15px] w-[15px]" />
          </div>
          {expanded && <span className="truncate text-xs">Settings</span>}
        </Link>
      )}
```

**Step 3: Commit**

```bash
git add packages/dashboard/src/components/sidebar.tsx
git commit -m "feat: add Settings link to sidebar"
```

---

### Task 8: Clean Up Overview Page

**Files:**
- Modify: `packages/dashboard/src/app/projects/[id]/page.tsx`

**Step 1: Remove SetupSection import and usage**

Remove line 3 (`import { SetupSection }`) and line 4 (`import type { SetupStatus }`).

Remove lines 65-66 (agentUrl/webhookUrl vars since they're only used by SetupSection).

Replace lines 97-111 (the `{/* Setup */}` section) with a conditional banner:

```typescript
      {/* Settings nudge (if no product context) */}
      {!project.product_context && (
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <p className="flex-1 text-xs text-muted">
            Set up your product context to improve proposal quality.
          </p>
          <Link
            href={`/projects/${id}/settings`}
            className="shrink-0 text-[11px] font-medium text-accent hover:text-fg"
          >
            Go to Settings
          </Link>
        </div>
      )}
```

**Step 2: Add product_context to the select query**

At line 25, add `product_context` to the `.select()` string:

```typescript
    .select('id, name, github_repo, product_context, webhook_secret, created_at, setup_progress, github_installation_id, setup_status, setup_pr_url, setup_error')
```

**Step 3: Add missing imports**

Add `Sparkles` to the lucide-react import and `Link` from next/link:

```typescript
import Link from 'next/link'
import { Github, Sparkles } from 'lucide-react'
```

**Step 4: Add setup incomplete banner**

If setup is not complete, show a one-liner pointing to Settings. Add after the product context nudge:

```typescript
      {/* Setup incomplete banner */}
      {project.setup_status !== 'complete' && project.setup_status !== 'pr_created' && (
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <span className="text-xs text-muted">Setup incomplete</span>
          <Link
            href={`/projects/${id}/settings`}
            className="text-[11px] font-medium text-accent hover:text-fg"
          >
            Go to Settings
          </Link>
        </div>
      )}
```

**Step 5: Commit**

```bash
git add packages/dashboard/src/app/projects/[id]/page.tsx
git commit -m "feat: clean up overview — move setup to settings, add context nudge"
```

---

### Task 9: Enhance Proposals Page

**Files:**
- Modify: `packages/dashboard/src/app/projects/[id]/proposals/page.tsx`
- Modify: `packages/dashboard/src/components/proposals-page-client.tsx`

**Step 1: Update server page to fetch ideas**

In `page.tsx`, after fetching proposals, add:

```typescript
  const { data: ideas } = await supabase
    .from('user_ideas')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(50)
```

Pass `ideas` to the client component:

```typescript
  <ProposalsPageClient
    projectId={project.id}
    githubRepo={project.github_repo}
    proposals={(proposals ?? []) as Proposal[]}
    ideas={(ideas ?? []) as UserIdea[]}
  />
```

Add `UserIdea` to the type import.

**Step 2: Update client component**

In `proposals-page-client.tsx`, add the "Your Input" section at the top.

Add these state variables and handlers:

```typescript
// Ideas state
const [ideas, setIdeas] = useState(initialIdeas)
const [ideaText, setIdeaText] = useState('')
const [submittingIdea, setSubmittingIdea] = useState(false)
const [showIdeas, setShowIdeas] = useState(false)

// Create proposal state
const [showCreateForm, setShowCreateForm] = useState(false)

async function submitIdea() {
  if (!ideaText.trim()) return
  setSubmittingIdea(true)
  try {
    const res = await fetch(`/api/ideas/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ideaText.trim() }),
    })
    if (res.ok) {
      const json = await res.json()
      setIdeas(prev => [json.idea, ...prev])
      setIdeaText('')
    }
  } finally {
    setSubmittingIdea(false)
  }
}

async function createUserProposal(title: string, spec: string, priority: string) {
  const res = await fetch(`/api/proposals/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, spec, priority }),
  })
  if (res.ok) {
    const json = await res.json()
    setProposals(prev => [json.proposal, ...prev])
    setShowCreateForm(false)
  }
}
```

Add the JSX for the "Your Input" card above the existing proposals sections:

```tsx
{/* Your Input */}
<div className="glass-card mb-8 p-5">
  <h2 className="mb-3 text-sm font-semibold text-fg">Your Input</h2>

  {/* Quick idea box */}
  <div className="mb-3 flex items-center gap-2">
    <input
      type="text"
      value={ideaText}
      onChange={e => setIdeaText(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') submitIdea() }}
      placeholder="Drop an idea or feature direction..."
      className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
    />
    <button
      onClick={submitIdea}
      disabled={!ideaText.trim() || submittingIdea}
      className="rounded-lg bg-accent/10 px-3 py-2 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
    >
      {submittingIdea ? 'Sending...' : 'Submit'}
    </button>
  </div>

  {/* Create proposal button */}
  <button
    onClick={() => setShowCreateForm(true)}
    className="text-[11px] text-accent hover:text-fg"
  >
    + Create a proposal
  </button>

  {/* Recent ideas (collapsible) */}
  {ideas.length > 0 && (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <button
        onClick={() => setShowIdeas(!showIdeas)}
        className="text-[11px] text-muted hover:text-fg"
      >
        {showIdeas ? 'Hide' : 'Show'} recent ideas ({ideas.length})
      </button>
      {showIdeas && (
        <div className="mt-2 space-y-1">
          {ideas.slice(0, 10).map(idea => (
            <div key={idea.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5">
              <span className="text-xs text-fg">{idea.text}</span>
              <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                idea.status === 'incorporated' ? 'bg-green-400/10 text-green-400'
                  : idea.status === 'dismissed' ? 'bg-white/[0.06] text-muted'
                  : 'bg-amber-400/10 text-amber-400'
              }`}>
                {idea.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )}
</div>
```

**Step 3: Add POST handler to proposals API for user-created proposals**

In `packages/dashboard/src/app/api/proposals/[projectId]/route.ts`, add a POST handler:

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  const body = await request.json()
  const { title, spec, priority } = body as { title: string; spec: string; priority: string }

  if (!title?.trim() || !spec?.trim()) {
    return NextResponse.json({ error: 'Title and spec are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('proposals')
    .insert({
      project_id: projectId,
      title: title.trim(),
      rationale: 'User-created proposal',
      spec: spec.trim(),
      priority: priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'medium',
      scores: {},
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ proposal: data })
}
```

**Step 4: Add a CreateProposalSlideOver component**

Create a simple slide-over form for user proposals. This reuses the existing slide-over pattern:

```typescript
// Inline in proposals-page-client.tsx or extract to a component
{showCreateForm && (
  <CreateProposalSlideOver
    onClose={() => setShowCreateForm(false)}
    onCreate={createUserProposal}
  />
)}
```

The `CreateProposalSlideOver` component follows the same pattern as `ProposalSlideOver` — fixed right panel, backdrop, escape-to-close, form with title/spec/priority fields, and a submit button.

**Step 5: Update ProposalCard to handle user proposals (no scores)**

In the ProposalCard component, when `proposal.scores` is empty (`{}`), show a "User" badge instead of the score bar:

```tsx
{Object.keys(proposal.scores).length > 0 ? (
  <ScoreBar scores={proposal.scores} />
) : (
  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">User</span>
)}
```

**Step 6: Commit**

```bash
git add packages/dashboard/src/app/projects/[id]/proposals/ packages/dashboard/src/components/proposals-page-client.tsx packages/dashboard/src/app/api/proposals/[projectId]/route.ts
git commit -m "feat: enhance proposals page — idea box, user proposals, create form"
```

---

### Task 10: Update Strategize Worker

**Files:**
- Modify: `packages/agent/src/strategize-worker.ts`

**Step 1: Add nudges and ideas to the context gather**

Expand the parallel Promise.all (lines 27-39) to include `strategic_nudges` in the project query and add a `user_ideas` query:

Change line 34 from:
```typescript
supabase.from('projects').select('name, github_repo, product_context').eq('id', projectId).single(),
```
to:
```typescript
supabase.from('projects').select('name, github_repo, product_context, strategic_nudges').eq('id', projectId).single(),
```

Add after line 38 (the strategy_memory query):
```typescript
supabase.from('user_ideas').select('id, text, status').eq('project_id', projectId).eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
```

Update the destructuring to include the new data:
```typescript
const [
  { data: project },
  { data: themes },
  { data: sessions },
  { data: recentProposals },
  { data: memory },
  { data: pendingIdeas },
] = await Promise.all([...])
```

**Step 2: Format and inject into prompt**

After `memoryContext` (line 67), add:

```typescript
const nudgesContext = (project.strategic_nudges ?? []).length > 0
  ? (project.strategic_nudges as string[]).map((n: string) => `- ${n}`).join('\n')
  : ''

const ideasContext = (pendingIdeas ?? [])
  .map(i => `- ${i.text}`)
  .join('\n') || ''
```

In the prompt template (between lines 90-91, after the strategy memory section), add:

```typescript
${nudgesContext ? `\n## Strategic directives from the product owner (HIGH PRIORITY — follow these)\n${nudgesContext}\n` : ''}
${ideasContext ? `\n## User-submitted ideas to consider\n${ideasContext}\n` : ''}
```

**Step 3: Mark ideas as incorporated/dismissed after proposal generation**

After the proposal insertion loop (after line 193), add:

```typescript
// Mark user ideas as incorporated or dismissed
if (pendingIdeas?.length) {
  const proposalTitles = rawProposals.map(p => p.title.toLowerCase() + ' ' + p.rationale.toLowerCase())
  for (const idea of pendingIdeas) {
    const ideaWords = idea.text.toLowerCase().split(/\s+/)
    const incorporated = proposalTitles.some(text =>
      ideaWords.filter(w => w.length > 3).some(word => text.includes(word))
    )
    await supabase
      .from('user_ideas')
      .update({ status: incorporated ? 'incorporated' : 'dismissed' })
      .eq('id', idea.id)
  }
}
```

**Step 4: Commit**

```bash
git add packages/agent/src/strategize-worker.ts
git commit -m "feat: strategize worker reads nudges and user ideas"
```

---

### Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (root)

**Step 1: Add Settings page documentation**

In the `## Dashboard` section, add after the proposals page entry:

```markdown
- Settings page: `/projects/[id]/settings` — product context (auto-generated from GitHub + editable), strategic nudges (persistent directives), setup & config (moved from overview)
- User ideas: `/api/ideas/[projectId]` — GET (list), POST (create) — quick idea submissions that feed into strategize runs
- Settings API: `/api/projects/[id]/settings` — GET/PATCH for product_context and strategic_nudges
- Context generation: `/api/projects/[id]/context/generate` — POST, fetches GitHub repo data and generates product summary via Haiku
```

In the `## Proposals System` section, add:

```markdown
- **Strategic nudges:** `projects.strategic_nudges` (text array) — persistent directives injected into strategize prompt as high-priority constraints
- **User ideas:** `user_ideas` table — submitted via dashboard, included in strategize prompt, marked `incorporated` or `dismissed` after each run
- **User proposals:** Users can create proposals directly (no AI scoring) — stored with empty `scores` object, shown with "User" badge
```

In the Supabase tables list, add `user_ideas`.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with settings page and user ideas"
```

---

### Task 12: Build and Verify

**Step 1: Build the dashboard**

```bash
cd /Users/nikitadmitrieff/Projects/feedback-chat && npm run build
```

Expected: builds without errors.

**Step 2: Build the agent**

```bash
cd packages/agent && npm run build
```

Expected: compiles without errors.

**Step 3: Manual verification checklist**

- [ ] `/projects/[id]/settings` loads with product context, nudges, and setup sections
- [ ] "Generate from GitHub" button calls Haiku and populates product context
- [ ] Edit/save product context works
- [ ] Adding/removing nudges persists
- [ ] Overview page no longer shows setup section
- [ ] Overview shows context nudge banner if `product_context` is empty
- [ ] Proposals page shows "Your Input" card with idea box
- [ ] Submitting an idea creates a row in `user_ideas`
- [ ] "Create a proposal" opens a form and inserts a draft proposal with empty scores
- [ ] User proposals show "User" badge instead of score bar
- [ ] Sidebar shows Settings link with gear icon
