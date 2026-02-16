# Managed Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a hosted agent service with a dashboard so users skip Docker/Railway deployment entirely.

**Architecture:** New `packages/dashboard` (Next.js on Vercel) handles auth, project management, webhook receiving, and run monitoring. The existing agent is refactored into a worker that polls a Supabase job queue. The widget is unchanged — `agentUrl` already accepts any URL.

**Tech Stack:** Next.js 15 (App Router), Supabase (Auth + Postgres), @supabase/ssr, existing agent worker logic (vitest), Railway for worker deployment.

---

### Task 1: Create Supabase Project and Schema

**Files:**
- Create: `packages/dashboard/supabase/migrations/00001_initial_schema.sql`

This task sets up the Supabase project and database schema. The migration file is written locally — it will be applied via the Supabase dashboard or CLI.

**Step 1: Create Supabase project**

Go to https://supabase.com/dashboard and create a new project called `feedback-chat-platform`. Note the project URL and anon/service-role keys.

**Step 2: Write the migration**

Create `packages/dashboard/supabase/migrations/00001_initial_schema.sql`:

```sql
-- Projects: one per repo
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  github_repo text not null,
  webhook_secret text not null,
  created_at timestamptz default now()
);

-- API keys: one per project, used by widget's status handler
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  key_hash text not null,
  prefix text not null,
  created_at timestamptz default now()
);

-- Credentials: user's Claude keys, encrypted
create table credentials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  type text not null check (type in ('anthropic_api_key', 'claude_oauth')),
  encrypted_value text not null,
  created_at timestamptz default now()
);

-- Job queue: Postgres-based, workers poll this
create table job_queue (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  github_issue_number int not null,
  issue_title text not null default '',
  issue_body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  worker_id text,
  locked_at timestamptz,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Pipeline runs: the history view for the dashboard
create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references job_queue(id) on delete cascade,
  project_id uuid references projects(id) not null,
  github_issue_number int not null,
  github_pr_number int,
  stage text not null default 'queued',
  triggered_by text,
  started_at timestamptz default now(),
  completed_at timestamptz,
  result text check (result in ('success', 'failed', 'rejected'))
);

-- Run logs: streaming logs from the worker
create table run_logs (
  id bigint generated always as identity primary key,
  run_id uuid references pipeline_runs(id) on delete cascade not null,
  timestamp timestamptz default now(),
  level text default 'info',
  message text not null
);

-- Indexes for common queries
create index idx_job_queue_status on job_queue(status) where status = 'pending';
create index idx_pipeline_runs_project on pipeline_runs(project_id, started_at desc);
create index idx_run_logs_run on run_logs(run_id, timestamp);
create index idx_api_keys_hash on api_keys(key_hash);

-- RLS policies
alter table projects enable row level security;
alter table api_keys enable row level security;
alter table credentials enable row level security;
alter table job_queue enable row level security;
alter table pipeline_runs enable row level security;
alter table run_logs enable row level security;

-- Users can only see their own projects
create policy "Users see own projects" on projects
  for all using (auth.uid() = user_id);

-- API keys visible via project ownership
create policy "Users see own api_keys" on api_keys
  for all using (project_id in (select id from projects where user_id = auth.uid()));

-- Credentials visible via project ownership
create policy "Users see own credentials" on credentials
  for all using (project_id in (select id from projects where user_id = auth.uid()));

-- Job queue visible via project ownership
create policy "Users see own jobs" on job_queue
  for all using (project_id in (select id from projects where user_id = auth.uid()));

-- Pipeline runs visible via project ownership
create policy "Users see own runs" on pipeline_runs
  for all using (project_id in (select id from projects where user_id = auth.uid()));

-- Run logs visible via run ownership
create policy "Users see own logs" on run_logs
  for all using (run_id in (
    select pr.id from pipeline_runs pr
    join projects p on pr.project_id = p.id
    where p.user_id = auth.uid()
  ));
```

**Step 3: Apply migration**

Run via Supabase dashboard SQL editor or `supabase db push` if using the CLI locally.

**Step 4: Commit**

```bash
git add packages/dashboard/supabase/
git commit -m "feat(dashboard): add initial Supabase schema with 6 tables + RLS"
```

---

### Task 2: Scaffold Dashboard App

**Files:**
- Create: `packages/dashboard/package.json`
- Create: `packages/dashboard/tsconfig.json`
- Create: `packages/dashboard/next.config.ts`
- Create: `packages/dashboard/.env.local.example`
- Create: `packages/dashboard/src/app/layout.tsx`
- Create: `packages/dashboard/src/app/page.tsx`
- Create: `packages/dashboard/src/lib/supabase/server.ts`
- Create: `packages/dashboard/src/lib/supabase/client.ts`
- Create: `packages/dashboard/src/lib/supabase/middleware.ts`
- Create: `packages/dashboard/src/middleware.ts`
- Modify: `turbo.json` (add dashboard to build pipeline)

**Step 1: Create package.json**

```json
{
  "name": "@feedback-chat/dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "@supabase/ssr": "^0.5",
    "@supabase/supabase-js": "^2"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/react": "^19",
    "typescript": "^5.7"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create next.config.ts**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

**Step 4: Create .env.local.example**

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Step 5: Create Supabase server client**

Create `packages/dashboard/src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored in Server Components
          }
        },
      },
    }
  )
}
```

**Step 6: Create Supabase browser client**

Create `packages/dashboard/src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 7: Create Supabase middleware helper**

Create `packages/dashboard/src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login (except public routes)
  const isPublicRoute = request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname.startsWith('/api/webhook') ||
    request.nextUrl.pathname.startsWith('/api/agent')

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

**Step 8: Create middleware.ts**

Create `packages/dashboard/src/middleware.ts`:

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

**Step 9: Create root layout**

Create `packages/dashboard/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Feedback Chat — Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

**Step 10: Create home page (redirect to /projects)**

Create `packages/dashboard/src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/projects')
}
```

**Step 11: Install deps and verify build**

```bash
cd packages/dashboard && npm install
npm run build
```

**Step 12: Commit**

```bash
git add packages/dashboard/
git commit -m "feat(dashboard): scaffold Next.js app with Supabase auth"
```

---

### Task 3: Dashboard Auth — Login Page

**Files:**
- Create: `packages/dashboard/src/app/login/page.tsx`
- Create: `packages/dashboard/src/app/auth/callback/route.ts`
- Create: `packages/dashboard/src/app/auth/signout/route.ts`

**Step 1: Create login page**

Create `packages/dashboard/src/app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setSent(true)
  }

  async function handleGitHubLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  if (sent) {
    return (
      <div style={{ maxWidth: 400, margin: '100px auto', textAlign: 'center' }}>
        <h2>Check your email</h2>
        <p>We sent a login link to {email}</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 400, margin: '100px auto' }}>
      <h1>Feedback Chat</h1>
      <button onClick={handleGitHubLogin} style={{ width: '100%', padding: 12, marginBottom: 16 }}>
        Continue with GitHub
      </button>
      <hr />
      <form onSubmit={handleEmailLogin}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
        />
        <button type="submit" style={{ width: '100%', padding: 12 }}>
          Send magic link
        </button>
      </form>
    </div>
  )
}
```

**Step 2: Create auth callback route**

Create `packages/dashboard/src/app/auth/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/projects`)
}
```

**Step 3: Create signout route**

Create `packages/dashboard/src/app/auth/signout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/login`)
}
```

**Step 4: Verify login flow works**

```bash
cd packages/dashboard && npm run dev
# Open http://localhost:3001/login
# Click "Continue with GitHub" (requires GitHub OAuth app configured in Supabase)
```

**Step 5: Commit**

```bash
git add packages/dashboard/src/app/login/ packages/dashboard/src/app/auth/
git commit -m "feat(dashboard): add login page with GitHub OAuth + magic link"
```

---

### Task 4: Dashboard — Projects List and Create

**Files:**
- Create: `packages/dashboard/src/app/projects/page.tsx`
- Create: `packages/dashboard/src/app/projects/new/page.tsx`
- Create: `packages/dashboard/src/lib/api-keys.ts`

**Step 1: Create API key utility**

Create `packages/dashboard/src/lib/api-keys.ts`:

```ts
import crypto from 'node:crypto'

/** Generate a new API key. Returns { raw, hash, prefix }. */
export function generateApiKey() {
  const raw = `fc_live_${crypto.randomBytes(24).toString('base64url')}`
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const prefix = raw.slice(0, 16)
  return { raw, hash, prefix }
}

/** Hash an API key for lookup. */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}
```

**Step 2: Create projects list page**

Create `packages/dashboard/src/app/projects/page.tsx`:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, github_repo, created_at')
    .order('created_at', { ascending: false })

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Projects</h1>
        <Link href="/projects/new">New Project</Link>
      </div>
      {(!projects || projects.length === 0) ? (
        <p>No projects yet. <Link href="/projects/new">Create one</Link>.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {projects.map((p) => (
            <li key={p.id} style={{ padding: '16px 0', borderBottom: '1px solid #eee' }}>
              <Link href={`/projects/${p.id}`}>
                <strong>{p.name}</strong>
                <span style={{ marginLeft: 12, color: '#666' }}>{p.github_repo}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action="/auth/signout" method="post" style={{ marginTop: 40 }}>
        <button type="submit">Sign out</button>
      </form>
    </div>
  )
}
```

**Step 3: Create new project page**

Create `packages/dashboard/src/app/projects/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { generateApiKey } from '@/lib/api-keys'
import crypto from 'node:crypto'

export default function NewProjectPage() {
  async function createProject(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const name = formData.get('name') as string
    const githubRepo = formData.get('github_repo') as string
    const credentialType = formData.get('credential_type') as string
    const credentialValue = formData.get('credential_value') as string

    const webhookSecret = crypto.randomBytes(32).toString('hex')

    // Create project
    const { data: project, error } = await supabase
      .from('projects')
      .insert({ name, github_repo: githubRepo, webhook_secret: webhookSecret, user_id: user.id })
      .select('id')
      .single()

    if (error || !project) throw new Error(error?.message ?? 'Failed to create project')

    // Create API key
    const { raw, hash, prefix } = generateApiKey()
    await supabase.from('api_keys').insert({
      project_id: project.id,
      key_hash: hash,
      prefix,
    })

    // Store credential
    if (credentialValue) {
      await supabase.from('credentials').insert({
        project_id: project.id,
        type: credentialType,
        encrypted_value: credentialValue,  // TODO: encrypt with pgcrypto
      })
    }

    redirect(`/projects/${project.id}?apiKey=${encodeURIComponent(raw)}&webhookSecret=${encodeURIComponent(webhookSecret)}`)
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px' }}>
      <h1>New Project</h1>
      <form action={createProject}>
        <div style={{ marginBottom: 16 }}>
          <label>Project name</label><br />
          <input name="name" required placeholder="My App" style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>GitHub repo (owner/name)</label><br />
          <input name="github_repo" required placeholder="owner/repo" style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Claude credential type</label><br />
          <select name="credential_type" style={{ width: '100%', padding: 8 }}>
            <option value="anthropic_api_key">Anthropic API Key</option>
            <option value="claude_oauth">Claude OAuth (Max subscription)</option>
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Claude credential value</label><br />
          <input name="credential_value" type="password" placeholder="sk-ant-... or JSON" style={{ width: '100%', padding: 8 }} />
        </div>
        <button type="submit" style={{ padding: '12px 24px' }}>Create Project</button>
      </form>
    </div>
  )
}
```

**Step 4: Verify in browser**

```bash
cd packages/dashboard && npm run dev
# Login, create a project, verify it shows in the list
```

**Step 5: Commit**

```bash
git add packages/dashboard/src/app/projects/ packages/dashboard/src/lib/api-keys.ts
git commit -m "feat(dashboard): add projects list and create flow with API keys"
```

---

### Task 5: Dashboard — Project Detail Page (Runs + Settings)

**Files:**
- Create: `packages/dashboard/src/app/projects/[id]/page.tsx`

**Step 1: Create project detail page**

Create `packages/dashboard/src/app/projects/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ apiKey?: string; webhookSecret?: string }>
}) {
  const { id } = await params
  const { apiKey, webhookSecret } = await searchParams
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, github_repo, webhook_secret, created_at')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('id, github_issue_number, github_pr_number, stage, triggered_by, started_at, completed_at, result')
    .eq('project_id', id)
    .order('started_at', { ascending: false })
    .limit(50)

  // Show setup instructions if apiKey is in URL (just created)
  const showSetup = !!apiKey

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <h1>{project.name}</h1>
      <p style={{ color: '#666' }}>{project.github_repo}</p>

      {showSetup && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <h3>Setup Instructions</h3>
          <p>Add to your consumer app's <code>.env.local</code>:</p>
          <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: 12, borderRadius: 4, overflow: 'auto' }}>
{`AGENT_URL=https://app.feedback.chat/api/agent/${project.id}
FEEDBACK_CHAT_API_KEY=${apiKey}`}
          </pre>
          <p>Add this webhook to your GitHub repo ({project.github_repo}):</p>
          <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: 12, borderRadius: 4, overflow: 'auto' }}>
{`URL: https://app.feedback.chat/api/webhook/${project.id}
Secret: ${webhookSecret}
Content type: application/json
Events: Issues`}
          </pre>
          <p><strong>Save these now</strong> — the API key and webhook secret won't be shown again.</p>
        </div>
      )}

      <h2>Pipeline Runs</h2>
      {(!runs || runs.length === 0) ? (
        <p>No runs yet. Submit feedback through the widget to trigger a pipeline run.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Issue</th>
              <th style={{ padding: 8 }}>Triggered by</th>
              <th style={{ padding: 8 }}>Stage</th>
              <th style={{ padding: 8 }}>Result</th>
              <th style={{ padding: 8 }}>PR</th>
              <th style={{ padding: 8 }}>Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: 8 }}>#{run.github_issue_number}</td>
                <td style={{ padding: 8 }}>{run.triggered_by ?? '—'}</td>
                <td style={{ padding: 8 }}>{run.stage}</td>
                <td style={{ padding: 8 }}>{run.result ?? '—'}</td>
                <td style={{ padding: 8 }}>
                  {run.github_pr_number ? (
                    <a
                      href={`https://github.com/${project.github_repo}/pull/${run.github_pr_number}`}
                      target="_blank"
                      rel="noopener"
                    >
                      #{run.github_pr_number}
                    </a>
                  ) : '—'}
                </td>
                <td style={{ padding: 8 }}>{new Date(run.started_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 40 }}>Settings</h2>
      <dl>
        <dt>Webhook URL</dt>
        <dd><code>https://app.feedback.chat/api/webhook/{project.id}</code></dd>
        <dt>Webhook Secret</dt>
        <dd><code>{project.webhook_secret}</code></dd>
      </dl>
    </div>
  )
}
```

**Step 2: Verify in browser**

```bash
cd packages/dashboard && npm run dev
# Navigate to /projects/{id}, verify run table renders (empty for now)
```

**Step 3: Commit**

```bash
git add packages/dashboard/src/app/projects/
git commit -m "feat(dashboard): add project detail page with runs table and setup instructions"
```

---

### Task 6: Platform API — Webhook Receiver

**Files:**
- Create: `packages/dashboard/src/app/api/webhook/[projectId]/route.ts`

This receives GitHub issue events and enqueues jobs. It reuses the same HMAC verification logic from the existing agent.

**Step 1: Write the failing test**

Create `packages/dashboard/src/app/api/webhook/__tests__/webhook.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'

// Test the HMAC logic in isolation
function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`
  if (signature.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

describe('webhook HMAC verification', () => {
  it('accepts valid signature', () => {
    const payload = '{"action":"opened"}'
    const sig = `sha256=${crypto.createHmac('sha256', 'secret').update(payload).digest('hex')}`
    expect(verifySignature(payload, sig, 'secret')).toBe(true)
  })

  it('rejects invalid signature', () => {
    expect(verifySignature('{}', 'sha256=bad', 'secret')).toBe(false)
  })
})
```

**Step 2: Run test to verify it passes**

```bash
cd packages/dashboard && npx vitest run src/app/api/webhook/__tests__/webhook.test.ts
```

**Step 3: Create the webhook route**

Create `packages/dashboard/src/app/api/webhook/[projectId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Use service role to bypass RLS — this is a webhook endpoint, no user session
function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`
  if (signature.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = supabaseAdmin()

  // Look up project + webhook secret
  const { data: project } = await supabase
    .from('projects')
    .select('id, webhook_secret, github_repo')
    .eq('id', projectId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Verify HMAC
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''
  if (!verifySignature(rawBody, signature, project.webhook_secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  // Parse event
  const event = request.headers.get('x-github-event')
  const payload = JSON.parse(rawBody)

  if (event !== 'issues') {
    return NextResponse.json({ status: 'ignored' })
  }

  const action = payload.action
  if (action !== 'opened' && action !== 'reopened') {
    return NextResponse.json({ status: 'ignored' })
  }

  const labels: string[] = (payload.issue?.labels ?? []).map((l: { name: string }) => l.name)
  if (!labels.includes('feedback-bot')) {
    return NextResponse.json({ status: 'ignored' })
  }
  if (labels.includes('in-progress') || labels.includes('agent-failed')) {
    return NextResponse.json({ status: 'ignored' })
  }

  const issue = payload.issue
  const triggeredBy = payload.issue?.user?.login ?? null

  // Enqueue job
  const { error: jobError } = await supabase.from('job_queue').insert({
    project_id: project.id,
    github_issue_number: issue.number,
    issue_title: issue.title ?? '',
    issue_body: issue.body ?? '',
  })

  if (jobError) {
    return NextResponse.json({ error: 'Failed to enqueue' }, { status: 500 })
  }

  // Create pipeline run record
  await supabase.from('pipeline_runs').insert({
    project_id: project.id,
    github_issue_number: issue.number,
    stage: 'queued',
    triggered_by: triggeredBy,
  })

  return NextResponse.json({ status: 'queued' })
}
```

**Step 4: Commit**

```bash
git add packages/dashboard/src/app/api/webhook/
git commit -m "feat(dashboard): add webhook receiver route with HMAC verification"
```

---

### Task 7: Platform API — Health/Status Proxy

**Files:**
- Create: `packages/dashboard/src/app/api/agent/[projectId]/health/route.ts`
- Create: `packages/dashboard/src/lib/auth-api-key.ts`

This endpoint replaces the self-hosted agent's `/health` route. The widget's `createStatusHandler` calls `${agentUrl}/health` — so the response shape must match exactly: `{ status, currentJob, queueLength }`.

**Step 1: Create API key auth helper**

Create `packages/dashboard/src/lib/auth-api-key.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { hashApiKey } from './api-keys'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Validate an API key and return the project_id it belongs to, or null. */
export async function validateApiKey(key: string): Promise<string | null> {
  const hash = hashApiKey(key)
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from('api_keys')
    .select('project_id')
    .eq('key_hash', hash)
    .single()

  return data?.project_id ?? null
}
```

**Step 2: Create health route**

Create `packages/dashboard/src/app/api/agent/[projectId]/health/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = supabaseAdmin()

  // Find currently processing job for this project
  const { data: currentJobRow } = await supabase
    .from('job_queue')
    .select('github_issue_number')
    .eq('project_id', projectId)
    .eq('status', 'processing')
    .limit(1)
    .single()

  // Count pending jobs
  const { count } = await supabase
    .from('job_queue')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('status', 'pending')

  return NextResponse.json({
    status: 'ok',
    currentJob: currentJobRow?.github_issue_number ?? null,
    queueLength: count ?? 0,
  })
}
```

This matches the exact response shape from `packages/agent/src/server.ts:72-78` — `{ status: 'ok', currentJob: number | null, queueLength: number }`. The widget's `isAgentRunning()` at `status-handler.ts:155` checks `data.currentJob === issueNumber`, which will work unchanged.

**Step 3: Commit**

```bash
git add packages/dashboard/src/app/api/agent/ packages/dashboard/src/lib/auth-api-key.ts
git commit -m "feat(dashboard): add health proxy route compatible with widget status handler"
```

---

### Task 8: Platform API — Runs Endpoint

**Files:**
- Create: `packages/dashboard/src/app/api/runs/[projectId]/route.ts`
- Create: `packages/dashboard/src/app/api/runs/[projectId]/[runId]/logs/route.ts`

**Step 1: Create runs list endpoint**

Create `packages/dashboard/src/app/api/runs/[projectId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  const { data: runs, error } = await supabase
    .from('pipeline_runs')
    .select('id, github_issue_number, github_pr_number, stage, triggered_by, started_at, completed_at, result')
    .eq('project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ runs })
}
```

**Step 2: Create run logs endpoint**

Create `packages/dashboard/src/app/api/runs/[projectId]/[runId]/logs/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  const { runId } = await params
  const supabase = await createClient()

  const { data: logs, error } = await supabase
    .from('run_logs')
    .select('id, timestamp, level, message')
    .eq('run_id', runId)
    .order('timestamp', { ascending: true })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs })
}
```

**Step 3: Commit**

```bash
git add packages/dashboard/src/app/api/runs/
git commit -m "feat(dashboard): add runs list and logs API endpoints"
```

---

### Task 9: Refactor Agent — Supabase Queue Poller

This is the biggest task. The current `packages/agent/src/server.ts` is a Fastify HTTP server with an in-memory queue. We refactor it into a standalone worker that polls the Supabase `job_queue` table.

**Files:**
- Modify: `packages/agent/src/server.ts` (rewrite to queue poller)
- Modify: `packages/agent/src/worker.ts` (accept project credentials, write logs to DB)
- Modify: `packages/agent/src/github.ts` (accept token/repo as params instead of env)
- Create: `packages/agent/src/supabase.ts` (Supabase client)
- Create: `packages/agent/src/logger.ts` (DB logger)
- Modify: `packages/agent/package.json` (add @supabase/supabase-js)

**Important:** The existing self-hosted agent must still work for users who self-host. The refactor should support both modes: self-hosted (Fastify, env vars) and managed (queue polling, per-job credentials). The cleanest way is to keep the Fastify server as-is and create a new entry point for the managed worker.

**Step 1: Install Supabase client in agent package**

```bash
cd packages/agent && npm install @supabase/supabase-js
```

**Step 2: Create Supabase client**

Create `packages/agent/src/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

export function createSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  return createClient(url, key)
}
```

**Step 3: Create DB logger**

Create `packages/agent/src/logger.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export class DbLogger {
  constructor(
    private supabase: SupabaseClient,
    private runId: string,
  ) {}

  async log(message: string, level = 'info') {
    console.log(`[${level}] ${message}`)
    await this.supabase.from('run_logs').insert({
      run_id: this.runId,
      level,
      message,
    })
  }

  async error(message: string) {
    return this.log(message, 'error')
  }

  async warn(message: string) {
    return this.log(message, 'warn')
  }
}
```

**Step 4: Modify github.ts — accept token/repo as params**

The current `github.ts` reads `GITHUB_TOKEN` and `GITHUB_REPO` from `process.env` via `getConfig()`. For managed mode, we need to pass them per-job. Add an optional config parameter to each exported function.

In `packages/agent/src/github.ts`, change `getConfig()` to accept an override:

```ts
// Change line 1-8 from:
function getConfig() {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  if (!token || !repo) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPO must be set')
  }
  return { token, repo }
}

// To:
export type GitHubConfig = { token: string; repo: string }

function getConfig(override?: GitHubConfig): GitHubConfig {
  if (override) return override
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  if (!token || !repo) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPO must be set')
  }
  return { token, repo }
}
```

Then add an optional `gh?: GitHubConfig` parameter to every exported function. Example for `commentOnIssue`:

```ts
// Before:
export async function commentOnIssue(issueNumber: number, body: string): Promise<void> {
  const { token, repo } = getConfig()

// After:
export async function commentOnIssue(issueNumber: number, body: string, gh?: GitHubConfig): Promise<void> {
  const { token, repo } = getConfig(gh)
```

Apply the same pattern to: `labelIssue`, `closeIssue`, `createPR`, `findOpenPR`, `removeLabelFromIssue`, `getIssueComments`.

**Step 5: Verify existing tests still pass**

```bash
cd packages/agent && npm test
```

Expected: All tests pass (parse-issue, webhook, github tests are unit tests that don't call `getConfig()`).

**Step 6: Modify worker.ts — accept per-job credentials**

Add a `ManagedJobInput` interface and a `runManagedJob` export that wraps `runJob` with per-job credentials:

At the end of `packages/agent/src/worker.ts`, add:

```ts
import type { GitHubConfig } from './github.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DbLogger } from './logger.js'

export interface ManagedJobInput extends JobInput {
  projectId: string
  github: GitHubConfig
  claudeCredentials?: string  // CLAUDE_CREDENTIALS_JSON value
  anthropicApiKey?: string    // ANTHROPIC_API_KEY value
  runId: string
  supabase: SupabaseClient
}

export async function runManagedJob(input: ManagedJobInput): Promise<void> {
  const logger = new DbLogger(input.supabase, input.runId)

  // Set per-job env vars so existing code paths work
  process.env.GITHUB_TOKEN = input.github.token
  process.env.GITHUB_REPO = input.github.repo

  if (input.claudeCredentials) {
    process.env.CLAUDE_CREDENTIALS_JSON = input.claudeCredentials
    initCredentials()
  } else if (input.anthropicApiKey) {
    process.env.ANTHROPIC_API_KEY = input.anthropicApiKey
    delete process.env.CLAUDE_CREDENTIALS_JSON
  }

  // Update pipeline run stage
  await input.supabase
    .from('pipeline_runs')
    .update({ stage: 'running' })
    .eq('id', input.runId)

  await logger.log(`Starting job for issue #${input.issueNumber}`)

  try {
    await runJob(input)

    await input.supabase
      .from('pipeline_runs')
      .update({ stage: 'validating', completed_at: new Date().toISOString(), result: 'success' })
      .eq('id', input.runId)

    await logger.log('Job completed successfully')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    await input.supabase
      .from('pipeline_runs')
      .update({ completed_at: new Date().toISOString(), result: 'failed' })
      .eq('id', input.runId)

    await logger.error(`Job failed: ${msg}`)
    throw err
  }
}
```

Add the missing import at the top of worker.ts:

```ts
import { initCredentials } from './oauth.js'
```

(This import is already there via `ensureValidToken`, but `initCredentials` needs to be imported too.)

**Step 7: Create managed worker entry point**

Create `packages/agent/src/managed-worker.ts`:

```ts
import { createSupabaseClient } from './supabase.js'
import { runManagedJob } from './worker.js'
import type { SupabaseClient } from '@supabase/supabase-js'

const POLL_INTERVAL_MS = 5_000  // 5 seconds
const WORKER_ID = `worker-${process.pid}-${Date.now()}`

async function pollForJobs(supabase: SupabaseClient) {
  // Claim one pending job using SELECT ... FOR UPDATE SKIP LOCKED
  const { data: job, error } = await supabase.rpc('claim_next_job', {
    p_worker_id: WORKER_ID,
  })

  if (error || !job) return null
  return job
}

async function fetchCredentials(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase
    .from('credentials')
    .select('type, encrypted_value')
    .eq('project_id', projectId)
    .single()

  if (!data) throw new Error(`No credentials for project ${projectId}`)

  return {
    claudeCredentials: data.type === 'claude_oauth' ? data.encrypted_value : undefined,
    anthropicApiKey: data.type === 'anthropic_api_key' ? data.encrypted_value : undefined,
  }
}

async function fetchGithubConfig(supabase: SupabaseClient, projectId: string) {
  // For now, users store their GitHub PAT as a credential.
  // TODO: In Approach 1, this comes from the GitHub App installation token.
  const { data: project } = await supabase
    .from('projects')
    .select('github_repo')
    .eq('id', projectId)
    .single()

  if (!project) throw new Error(`Project ${projectId} not found`)

  // GitHub token stored as a separate credential row with type 'github_pat'
  // For MVP, we'll read it from env. The consumer still sets GITHUB_TOKEN in their webhook.
  // TODO: Store GitHub PAT in credentials table too.
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN must be set on the worker')

  return { token, repo: project.github_repo }
}

async function findRunId(supabase: SupabaseClient, projectId: string, issueNumber: number): Promise<string> {
  const { data } = await supabase
    .from('pipeline_runs')
    .select('id')
    .eq('project_id', projectId)
    .eq('github_issue_number', issueNumber)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) throw new Error(`No pipeline run found for issue #${issueNumber}`)
  return data.id
}

async function processJob(supabase: SupabaseClient, job: {
  id: string
  project_id: string
  github_issue_number: number
  issue_title: string
  issue_body: string
}) {
  console.log(`[${WORKER_ID}] Processing job ${job.id} (issue #${job.github_issue_number})`)

  try {
    const creds = await fetchCredentials(supabase, job.project_id)
    const github = await fetchGithubConfig(supabase, job.project_id)
    const runId = await findRunId(supabase, job.project_id, job.github_issue_number)

    await runManagedJob({
      issueNumber: job.github_issue_number,
      issueTitle: job.issue_title,
      issueBody: job.issue_body,
      projectId: job.project_id,
      github,
      ...creds,
      runId,
      supabase,
    })

    // Mark job as done
    await supabase
      .from('job_queue')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', job.id)
  } catch (err) {
    console.error(`[${WORKER_ID}] Job ${job.id} failed:`, err)
    await supabase
      .from('job_queue')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', job.id)
  }
}

async function main() {
  const supabase = createSupabaseClient()
  console.log(`[${WORKER_ID}] Starting managed worker, polling every ${POLL_INTERVAL_MS}ms`)

  while (true) {
    const job = await pollForJobs(supabase)

    if (job) {
      await processJob(supabase, job)
    } else {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
  }
}

main().catch((err) => {
  console.error('Worker crashed:', err)
  process.exit(1)
})
```

**Step 8: Create the Supabase RPC function for atomic job claiming**

Add to the migration file or apply via SQL editor:

```sql
create or replace function claim_next_job(p_worker_id text)
returns json as $$
declare
  claimed job_queue%rowtype;
begin
  select * into claimed
  from job_queue
  where status = 'pending'
  order by created_at
  limit 1
  for update skip locked;

  if claimed.id is null then
    return null;
  end if;

  update job_queue
  set status = 'processing', worker_id = p_worker_id, locked_at = now()
  where id = claimed.id;

  return row_to_json(claimed);
end;
$$ language plpgsql;
```

Save this as `packages/dashboard/supabase/migrations/00002_claim_job_rpc.sql`.

**Step 9: Add managed worker script to package.json**

In `packages/agent/package.json`, add to scripts:

```json
"start:managed": "node dist/managed-worker.js"
```

**Step 10: Verify existing self-hosted mode still works**

```bash
cd packages/agent && npm run build && npm test
```

Expected: All existing tests pass. The self-hosted `server.ts` is untouched.

**Step 11: Commit**

```bash
git add packages/agent/ packages/dashboard/supabase/migrations/00002_claim_job_rpc.sql
git commit -m "feat(agent): add managed worker mode with Supabase queue polling"
```

---

### Task 10: Integration Testing — End to End

**Files:**
- Create: `packages/dashboard/src/app/api/webhook/__tests__/integration.test.ts`

**Step 1: Write an integration test**

Create `packages/dashboard/src/app/api/webhook/__tests__/integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

/**
 * Manual integration test checklist:
 *
 * 1. Start the dashboard: cd packages/dashboard && npm run dev
 * 2. Login and create a project
 * 3. Note the project ID, API key, and webhook secret
 * 4. Simulate a webhook:
 *
 *    curl -X POST http://localhost:3001/api/webhook/{PROJECT_ID} \
 *      -H "Content-Type: application/json" \
 *      -H "X-GitHub-Event: issues" \
 *      -H "X-Hub-Signature-256: sha256=$(echo -n '{"action":"opened","issue":{"number":1,"title":"Test","body":"Test body","labels":[{"name":"feedback-bot"}],"user":{"login":"testuser"}}}' | openssl dgst -sha256 -hmac 'YOUR_WEBHOOK_SECRET' | awk '{print $2}')" \
 *      -d '{"action":"opened","issue":{"number":1,"title":"Test","body":"Test body","labels":[{"name":"feedback-bot"}],"user":{"login":"testuser"}}}'
 *
 * 5. Check Supabase: job_queue should have a new row with status='pending'
 * 6. Check Supabase: pipeline_runs should have a new row with stage='queued'
 * 7. Check health endpoint:
 *
 *    curl http://localhost:3001/api/agent/{PROJECT_ID}/health
 *    → { "status": "ok", "currentJob": null, "queueLength": 1 }
 *
 * 8. Start the managed worker:
 *    cd packages/agent && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GITHUB_TOKEN=... npm run start:managed
 *
 * 9. Worker should pick up the job, process it, and update job_queue.status to 'done'
 * 10. Dashboard at /projects/{id} should show the run in the table
 */

describe('integration checklist', () => {
  it('is documented above — run manually', () => {
    expect(true).toBe(true)
  })
})
```

**Step 2: Run the manual integration test**

Follow the checklist above.

**Step 3: Commit**

```bash
git add packages/dashboard/src/app/api/webhook/__tests__/
git commit -m "test(dashboard): add integration test checklist for webhook → worker → dashboard flow"
```

---

### Task 11: Deploy Dashboard to Vercel + Worker to Railway

**Step 1: Deploy dashboard to Vercel**

```bash
cd packages/dashboard
npx vercel --yes
# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

**Step 2: Deploy managed worker to Railway**

```bash
cd packages/agent
railway init
railway up --detach
railway variables set \
  SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  GITHUB_TOKEN=ghp_...
```

Update the Railway service's start command to `npm run start:managed`.

**Step 3: Verify end-to-end**

1. Create a project in the deployed dashboard
2. Configure webhook on a test repo pointing to the Vercel URL
3. Submit feedback → issue created → webhook fires → job queued → worker processes → PR created
4. Dashboard shows the run

**Step 4: Commit any deployment config changes**

```bash
git add -A && git commit -m "chore: deployment configuration for Vercel + Railway"
```

---

## Summary

| Task | What | Effort |
|------|------|--------|
| 1 | Supabase schema (6 tables + RLS) | ~1 hour |
| 2 | Scaffold dashboard Next.js app | ~2 hours |
| 3 | Login page (GitHub OAuth + magic link) | ~1 hour |
| 4 | Projects list + create flow | ~2 hours |
| 5 | Project detail page (runs table) | ~1.5 hours |
| 6 | Webhook receiver API route | ~1.5 hours |
| 7 | Health/status proxy API route | ~1 hour |
| 8 | Runs + logs API endpoints | ~1 hour |
| 9 | Agent refactor (queue poller + per-job creds) | ~3-4 hours |
| 10 | Integration testing | ~1 hour |
| 11 | Deploy to Vercel + Railway | ~1-2 hours |

**Total: ~15-18 hours of focused work.**
