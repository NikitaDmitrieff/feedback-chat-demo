# Feedback Intelligence Hub Implementation Plan

> **For the Ralph loop:** Follow this plan task-by-task. Track progress in `progress.txt`.

**Epic:** EP-ND-001
**Goal:** Add a Feedback Intelligence Hub to the dashboard — feedback inbox with AI-powered theme clustering, tester activity view, and AI digest.
**Architecture:** Widget's `createFeedbackHandler` gains optional Supabase config for fire-and-forget conversation persistence. Dashboard gets new API routes that call Claude Haiku for classification/digest. New feedback page with digest card, theme-filterable conversation list, thread slide-over, and tester activity tab.

---

### Task 1: Supabase Migration — New Tables

**Files:**
- Create: `packages/dashboard/supabase/migrations/00004_feedback_tables.sql`

**What to do:**
Create three new tables in the `feedback_chat` schema:

**`feedback_sessions`** — one row per widget conversation:
- `id` uuid PK default gen_random_uuid()
- `project_id` uuid FK → projects(id) on delete cascade, not null
- `tester_id` text (nullable)
- `tester_name` text (nullable)
- `started_at` timestamptz default now()
- `last_message_at` timestamptz default now()
- `message_count` int default 0
- `ai_summary` text (nullable)
- `ai_themes` jsonb (nullable — array of theme UUIDs)
- `github_issue_number` int (nullable)
- `status` text not null default 'open', check in ('open', 'in_progress', 'resolved', 'dismissed')

**`feedback_messages`** — individual messages in a conversation:
- `id` uuid PK default gen_random_uuid()
- `session_id` uuid FK → feedback_sessions(id) on delete cascade, not null
- `role` text not null, check in ('user', 'assistant')
- `content` text not null
- `created_at` timestamptz default now()

**`feedback_themes`** — AI-generated theme registry per project:
- `id` uuid PK default gen_random_uuid()
- `project_id` uuid FK → projects(id) on delete cascade, not null
- `name` text not null
- `description` text (nullable)
- `color` text not null
- `message_count` int default 0
- `last_seen_at` timestamptz default now()

Add indexes on: `feedback_sessions(project_id, last_message_at desc)`, `feedback_sessions(project_id, tester_id)`, `feedback_messages(session_id, created_at)`, `feedback_themes(project_id)`.

Enable RLS on all three tables. Add policies:
- "Users see own sessions" on feedback_sessions — `project_id in (select id from projects where user_id = auth.uid())`
- "Users see own messages" on feedback_messages — session_id joined through feedback_sessions → projects
- "Users see own themes" on feedback_themes — same pattern as sessions

**Commit:** `feat(dashboard): add feedback_sessions, feedback_messages, feedback_themes tables`

---

### Task 2: Dashboard Types

**Files:**
- Modify: `packages/dashboard/src/lib/types.ts`

**What to do:**
Append these types after the existing `DeploymentInfo` type:

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
  ai_themes: string[] | null
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

**Commit:** `feat(dashboard): add feedback session, message, theme, and tester types`

---

### Task 3: Install Dashboard AI Dependencies

**Files:**
- Modify: `packages/dashboard/package.json`

**What to do:**
Run from `packages/dashboard/`:
```bash
npm install @ai-sdk/anthropic ai zod
```

The classify and digest API routes need these. Verify they appear in `dependencies` after install.

**Commit:** `feat(dashboard): add ai-sdk, anthropic, and zod dependencies`

---

### Task 4: Widget — Supabase Feedback Persistence

**Files:**
- Modify: `packages/widget/src/server/handler.ts`

**What to do:**
Add optional Supabase persistence to `createFeedbackHandler`. The design:

1. Add to `FeedbackHandlerConfig`:
```ts
supabase?: {
  url: string
  serviceRoleKey: string
  projectId: string
}
```

2. Add a `persistFeedback` async function that:
   - Dynamically imports `@supabase/supabase-js` (keeps it optional)
   - Creates a Supabase client with `{ db: { schema: 'feedback_chat' } }`
   - Finds or creates a `feedback_sessions` row (upsert pattern: look for existing session for same project + tester within last hour)
   - Inserts new `feedback_messages` rows (only messages not yet persisted, based on count comparison)
   - Updates `feedback_sessions.last_message_at` and `message_count`

3. In the POST handler, after `streamText()` and before returning, fire-and-forget:
```ts
if (config.supabase) {
  persistFeedback(config.supabase, messages).catch(() => {})
}
```

Key details:
- Tester name: use `'Anonymous'` as default. The tester_id is derived as lowercase slugified tester_name.
- Message content extraction: handle both string content and parts-based content (`m.parts?.filter(p => p.type === 'text').map(p => p.text).join('\n')`)
- This must be completely non-blocking — a failure in persistence should never break the chat

**Commit:** `feat(widget): add optional Supabase feedback persistence to chat handler`

---

### Task 5: Dashboard API — Feedback List + Session Detail

**Files:**
- Create: `packages/dashboard/src/app/api/feedback/[projectId]/route.ts`
- Create: `packages/dashboard/src/app/api/feedback/[projectId]/[sessionId]/route.ts`

**What to do:**

**List endpoint** (`GET /api/feedback/[projectId]`):
- Uses `createClient` from `@/lib/supabase/server`
- Queries `feedback_sessions` where `project_id` matches
- Supports query params: `theme` (contains filter on `ai_themes`), `tester` (eq on `tester_id`), `status` (eq on `status`)
- Orders by `last_message_at desc`, limit 100

**Session detail** (`GET /api/feedback/[projectId]/[sessionId]`):
- Queries `feedback_messages` where `session_id` matches
- Orders by `created_at asc`

**Session update** (`PATCH /api/feedback/[projectId]/[sessionId]`):
- Updates `feedback_sessions.status` from request body `{ status: string }`

**Commit:** `feat(dashboard): add feedback list and session detail API routes`

---

### Task 6: Dashboard API — AI Classification

**Files:**
- Create: `packages/dashboard/src/app/api/feedback/[projectId]/classify/route.ts`

**What to do:**

`POST /api/feedback/[projectId]/classify` — accepts `{ sessionId: string }`:

1. Fetch all messages for the session from `feedback_messages`
2. Fetch existing themes from `feedback_themes` for this project
3. Call `generateObject` from `ai` with Claude Haiku (`claude-haiku-4-5-20251001`):
   - Schema: `{ summary: string, themes: string[] (1-3), app_area: string }`
   - Prompt: include the conversation text + existing theme names
4. For each returned theme:
   - If it matches an existing theme (case-insensitive), increment that theme's `message_count` and `last_seen_at`
   - If new, create a new row in `feedback_themes` with auto-assigned color from a palette of 10 colors
5. Update the session with `ai_summary` and `ai_themes` (array of theme UUIDs)
6. Return `{ summary, themes, themeIds }`

Color palette: `['#5e9eff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1']`

**Commit:** `feat(dashboard): add AI classification endpoint using Claude Haiku`

---

### Task 7: Dashboard API — AI Digest

**Files:**
- Create: `packages/dashboard/src/app/api/feedback/[projectId]/digest/route.ts`

**What to do:**

`GET /api/feedback/[projectId]/digest?period=day|week`:

1. Calculate `since` date (1 day or 7 days ago)
2. Fetch sessions from `feedback_sessions` where `started_at >= since`
3. Fetch themes from `feedback_themes` ordered by `message_count desc`
4. If no sessions, return `{ digest: 'No feedback received this period.', stats: { total: 0, needsAttention: 0, resolved: 0 }, topThemes: [] }`
5. Otherwise, call `generateText` from `ai` with Claude Haiku:
   - Prompt includes: total count, needs-attention count, resolved count, top themes with counts, and session summaries
   - Ask for 3-5 actionable sentences for a solo founder
6. Return `{ digest: string, stats: { total, needsAttention, resolved }, topThemes: [{ id, name, count }] }`

**Commit:** `feat(dashboard): add AI digest endpoint using Claude Haiku`

---

### Task 8: Dashboard API — Tester Summaries

**Files:**
- Create: `packages/dashboard/src/app/api/feedback/[projectId]/testers/route.ts`

**What to do:**

`GET /api/feedback/[projectId]/testers`:

1. Fetch all sessions for this project
2. Fetch all themes for this project
3. Group sessions by `tester_id`
4. For each tester, compute: `session_count`, `last_active` (max of `last_message_at`), `top_themes` (from `ai_themes` → theme lookup, counted and sorted), `resolved_count`, `total_count`
5. Sort by `session_count desc`
6. Return array of `TesterSummary`

**Commit:** `feat(dashboard): add tester summary API endpoint`

---

### Task 9: Dashboard Component — Digest Card

**Files:**
- Create: `packages/dashboard/src/components/digest-card.tsx`

**What to do:**
A `'use client'` component that:
- Fetches `/api/feedback/${projectId}/digest?period=${period}` on mount
- Shows a glass-card with:
  - Header: Sparkles icon + "AI Digest" label
  - Day/Week toggle (two small buttons)
  - Refresh button (RefreshCw icon)
  - Stats row: total conversations, needs attention (amber), resolved (green) — large numbers with labels
  - AI digest text (the generated summary)
- Loading state: skeleton shimmer
- Empty state: "No feedback this {period}."

Match the glassmorphism styling from existing components (`glass-card`, `stat-card` CSS classes, Tailwind theme colors).

**Commit:** `feat(dashboard): add AI digest card component`

---

### Task 10: Dashboard Component — Feedback Session List

**Files:**
- Create: `packages/dashboard/src/components/feedback-list.tsx`

**What to do:**
A `'use client'` component. Props: `{ projectId: string, themes: FeedbackTheme[], onSelectSession: (session) => void }`.

Features:
- Fetches sessions from `/api/feedback/${projectId}` on mount (re-fetches when `activeTheme` filter changes)
- **Theme pills row**: "All (N)" + one pill per theme with color dot, name, and count. Clicking toggles filter.
- **Session list**: each row is a `glass-card` button showing:
  - Status dot (green=open, amber=in_progress, checkmark=resolved, gray=dismissed)
  - AI summary (or fallback "Conversation with {name}"), truncated to one line
  - Bottom line: tester name, time ago, theme tags (small colored pills)
  - Right side: message count
- Empty state with MessageCircle icon
- Loading state: 3 skeleton shimmers

Utility: include a `timeAgo(dateStr)` function (minutes/hours/days).

**Commit:** `feat(dashboard): add feedback session list component with theme pills`

---

### Task 11: Dashboard Component — Feedback Slide-Over

**Files:**
- Create: `packages/dashboard/src/components/feedback-slide-over.tsx`

**What to do:**
A `'use client'` component matching the pattern of `run-slide-over.tsx`. Props: `{ session, themes, projectId, githubRepo, onClose, onStatusChange }`.

Features:
- Fetches messages from `/api/feedback/${projectId}/${session.id}` on mount
- Backdrop + right-side panel (480px, z-50) — same layout as RunSlideOver
- **Header**: tester name, message count, close button
- **AI summary section** (if present): summary text + theme pills
- **Message thread**: scrollable list, user messages right-aligned with accent bg, assistant messages left-aligned with surface bg. Each shows role label + content.
- **GitHub issue link** (if session has `github_issue_number`)
- **Action bar** at bottom:
  - "Classify" button (Sparkles icon, calls `/api/feedback/${projectId}/classify` POST) — only shown if no AI summary yet
  - "Resolve" button (Check icon, green) — only shown if status is 'open'
  - "Dismiss" button (X icon, muted) — only shown if status is 'open'
- Escape key closes

**Commit:** `feat(dashboard): add feedback thread slide-over component`

---

### Task 12: Dashboard Component — Tester Activity

**Files:**
- Create: `packages/dashboard/src/components/tester-activity.tsx`

**What to do:**
A `'use client'` component. Props: `{ testers: TesterSummary[], onSelectTester: (testerId) => void }`.

Features:
- Header: "{N} tester(s) active" count
- List of tester cards (each a `glass-card` button):
  - Name + conversation count
  - Last active time + top theme pills (up to 3, with color)
  - Resolution rate progress bar (like the success rate bar in `stats-bar.tsx`)
- Empty state with Users icon
- Click calls `onSelectTester`

Include `timeAgo` utility (same as feedback-list, can duplicate — it's 5 lines).

**Commit:** `feat(dashboard): add tester activity view component`

---

### Task 13: Dashboard Page — Feedback Page + Client Wrapper

**Files:**
- Create: `packages/dashboard/src/app/projects/[id]/feedback/page.tsx`
- Create: `packages/dashboard/src/app/projects/[id]/feedback/client.tsx`

**What to do:**

**Server page** (`page.tsx`):
- Fetches project from Supabase (id, name, github_repo) — 404 if not found
- Fetches themes from `feedback_themes` for initial render
- Renders breadcrumb (ArrowLeft + project name linking back to `/projects/[id]`)
- Renders `<h1>Feedback</h1>`
- Renders `<FeedbackPageClient>` with props

**Client wrapper** (`client.tsx`):
- State: `tab` ('feedback' | 'testers'), `selectedSession`, `testers`
- Fetches `/api/feedback/${projectId}/testers` when testers tab is active
- Layout:
  1. `<DigestCard>` at top
  2. Tab toggle (two buttons in a rounded surface container): "Conversations" and "Testers"
  3. Conditional: `<FeedbackList>` or `<TesterActivity>` based on tab
  4. `<FeedbackSlideOver>` when a session is selected

**Commit:** `feat(dashboard): add feedback intelligence hub page`

---

### Task 14: Dashboard — Sidebar Feedback Link

**Files:**
- Modify: `packages/dashboard/src/components/sidebar.tsx`

**What to do:**
1. Import `MessageSquare` from lucide-react (alongside existing imports)
2. Extract projectId from pathname: `const projectMatch = pathname.match(/\/projects\/([^/]+)/); const projectId = projectMatch ? projectMatch[1] : null`
3. After the Projects `<Link>` and before the divider, add a Feedback link (only visible when `projectId` is truthy):
   - Links to `/projects/${projectId}/feedback`
   - Active state: `pathname.includes('/feedback')` → `bg-white/[0.08] text-fg`
   - Same layout pattern as Projects link (icon in 30x30 container, text when expanded)

**Commit:** `feat(dashboard): add contextual Feedback link to sidebar`

---

### Task 15: Dashboard — Digest Card on Project Page

**Files:**
- Modify: `packages/dashboard/src/app/projects/[id]/page.tsx`

**What to do:**
1. Import `DigestCard` from `@/components/digest-card`
2. Add it between `<StatsBar>` and `<SetupChecklist>`:
```tsx
<div className="mb-8">
  <DigestCard projectId={project.id} />
</div>
```

**Commit:** `feat(dashboard): add feedback digest card to project dashboard page`

---

### Task 16: Build Verification

**What to do:**
1. Run `cd packages/dashboard && npx tsc --noEmit` — fix any type errors
2. Run `npm run build` from the repo root — verify both widget and dashboard build
3. Fix any issues found

**Commit:** `fix(dashboard): resolve build issues from feedback intelligence hub` (only if fixes needed)

---

### Final Verification

- [ ] All tasks implemented per spec
- [ ] All acceptance criteria from EP-ND-001 met
- [ ] `progress.txt` shows all tasks complete
- [ ] `.artefacts/feedback-intelligence-hub/TESTING.md` created
- [ ] `.artefacts/feedback-intelligence-hub/CHANGELOG.md` created
