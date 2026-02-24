#!/usr/bin/env tsx
/**
 * seed-demo.ts
 *
 * Populates a Supabase project with realistic demo data for dashboard showcase.
 *
 * Usage:
 *   cd packages/dashboard
 *   npx tsx ../../scripts/seed-demo.ts
 *   npx tsx ../../scripts/seed-demo.ts --project-id=<existing-uuid>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * packages/dashboard/.env.local (or process.env as fallback).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

// Support running from repo root OR from packages/dashboard
const ENV_FILE_CANDIDATES = [
  join(process.cwd(), 'packages', 'dashboard', '.env.local'), // from repo root
  join(process.cwd(), '.env.local'), // from packages/dashboard
  resolve(process.cwd(), '..', '..', 'packages', 'dashboard', '.env.local'), // from scripts/
]
const ENV_FILE = ENV_FILE_CANDIDATES.find(existsSync) ?? ENV_FILE_CANDIDATES[0]

function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {}
  const result: Record<string, string> = {}
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const raw = trimmed.slice(idx + 1).trim()
    // Strip surrounding quotes
    result[key] = raw.replace(/^["']|["']$/g, '')
  }
  return result
}

const fileEnv = loadEnvFile(ENV_FILE)
const get = (key: string) => process.env[key] ?? fileEnv[key]

const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  Missing env vars. Add to packages/dashboard/.env.local:')
  console.error('    NEXT_PUBLIC_SUPABASE_URL=...')
  console.error('    SUPABASE_SERVICE_ROLE_KEY=...')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

// Admin client (no schema) for auth.users access
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// App client with feedback_chat schema
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: 'feedback_chat' },
  auth: { persistSession: false, autoRefreshToken: false },
})

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
let projectIdArg: string | undefined
const pidFlag = args.find((a) => a.startsWith('--project-id'))
if (pidFlag?.includes('=')) {
  projectIdArg = pidFlag.split('=')[1]
} else if (pidFlag) {
  const next = args[args.indexOf(pidFlag) + 1]
  if (next && !next.startsWith('--')) projectIdArg = next
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

const hoursAgo = (n: number) => {
  const d = new Date()
  d.setHours(d.getHours() - n)
  return d.toISOString()
}

const minutesAgo = (n: number) => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - n)
  return d.toISOString()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('🌱  Seeding demo data...\n')

  // ── 1. Find a real user to own the project ───────────────────────────────

  const {
    data: { users },
    error: usersError,
  } = await adminClient.auth.admin.listUsers({ perPage: 1 })

  if (usersError || !users || users.length === 0) {
    console.error(
      '❌  No users found in auth.users.\n    Log into the dashboard at least once before seeding.',
    )
    process.exit(1)
  }

  const userId = users[0].id
  console.log(`✔  Owner: ${users[0].email ?? userId}`)

  // ── 2. Project ───────────────────────────────────────────────────────────

  let projectId: string

  if (projectIdArg) {
    const { data: existing, error } = await db
      .from('projects')
      .select('id, name')
      .eq('id', projectIdArg)
      .single()

    if (error || !existing) {
      console.error(`❌  Project not found: ${projectIdArg} — ${error?.message}`)
      process.exit(1)
    }
    projectId = existing.id as string
    console.log(`✔  Using existing project: "${existing.name}" (${projectId})`)
  } else {
    const { data: project, error } = await db
      .from('projects')
      .insert({
        user_id: userId,
        name: 'PostPrep — College App Assistant',
        github_repo: 'nikitadmitrieff/postprep-demo',
        product_context:
          'AI-powered college application assistant that helps students craft essays, track deadlines, and get personalized advice. 2,400 beta users.',
        autonomy_mode: 'assist',
        setup_status: 'complete',
        strategic_nudges: [
          'Keep features accessible to first-generation college students',
          'Prioritise mobile UX — 70% of users are on phones',
        ],
      })
      .select()
      .single()

    if (error || !project) {
      console.error('❌  Failed to create project:', error?.message)
      process.exit(1)
    }
    projectId = project.id as string
    console.log(`✔  Created project: "${project.name}" (${projectId})`)
  }

  // ── 3. Feedback themes ───────────────────────────────────────────────────

  const THEME_DEFS = [
    {
      name: 'Performance',
      description: 'Loading times and responsiveness issues',
      color: '#f97316',
      message_count: 11,
    },
    {
      name: 'UX / Mobile',
      description: 'Mobile layout and interaction improvements',
      color: '#8b5cf6',
      message_count: 14,
    },
    {
      name: 'Feature Requests',
      description: 'New functionality users want',
      color: '#3b82f6',
      message_count: 22,
    },
    {
      name: 'AI Quality',
      description: 'Feedback quality and personalisation concerns',
      color: '#10b981',
      message_count: 8,
    },
    {
      name: 'Integrations',
      description: 'Third-party calendar and service integrations',
      color: '#f59e0b',
      message_count: 6,
    },
  ]

  const { data: themes, error: themesError } = await db
    .from('feedback_themes')
    .insert(THEME_DEFS.map((t) => ({ ...t, project_id: projectId })))
    .select()

  if (themesError || !themes) {
    console.error('❌  Failed to create themes:', themesError?.message)
    process.exit(1)
  }
  console.log(`✔  Created ${themes.length} feedback themes`)

  const themeId = (name: string): string => {
    const t = themes.find((x) => x.name === name)
    if (!t) throw new Error(`Theme not found: ${name}`)
    return t.id as string
  }

  // ── 4. Feedback sessions + messages ─────────────────────────────────────

  type SessionDef = {
    tester_name: string
    tester_id: string
    started_at: string
    last_message_at: string
    message_count: number
    ai_summary: string
    theme_names: string[]
    github_issue_number: number | null
    status: string
    messages: Array<{ role: string; content: string }>
  }

  const SESSION_DEFS: SessionDef[] = [
    {
      tester_name: 'Emma R.',
      tester_id: 'tester_emma_r',
      started_at: daysAgo(12),
      last_message_at: daysAgo(11),
      message_count: 5,
      ai_summary:
        'User frustrated by slow AI feedback generation; wants a progress indicator. High engagement despite the wait. Two refreshes before understanding the delay is normal.',
      theme_names: ['Performance', 'Feature Requests'],
      github_issue_number: 23,
      status: 'resolved',
      messages: [
        {
          role: 'user',
          content: 'The essay feedback takes forever to load, can you add a progress bar?',
        },
        {
          role: 'assistant',
          content:
            "I completely understand the frustration! A progress indicator would make the wait feel much more manageable. The AI analysis typically takes 8–15 seconds, so showing granular steps — 'Analysing structure… checking tone…' — would help a lot. I'm raising this with the team now.",
        },
        {
          role: 'user',
          content: 'Yeah, I thought it froze the first time. Waited 30 seconds then refreshed.',
        },
        {
          role: 'assistant',
          content:
            "That must have been really frustrating, especially when you were eager to see the feedback. I've flagged this as urgent — we'll add a visible loading state so you know it's working. In the meantime, analysis usually completes within 15 seconds even if it looks frozen.",
        },
        { role: 'user', content: 'Ok thanks. Other than that I love the suggestions feature.' },
      ],
    },
    {
      tester_name: 'Marcus T.',
      tester_id: 'tester_marcus_t',
      started_at: daysAgo(10),
      last_message_at: daysAgo(10),
      message_count: 4,
      ai_summary:
        'User wants anonymised benchmarking against successful applicants. Interested in section-by-section comparative scoring for essays.',
      theme_names: ['Feature Requests'],
      github_issue_number: null,
      status: 'in_progress',
      messages: [
        {
          role: 'user',
          content: 'I wish I could see how my essays compare to successful applications',
        },
        {
          role: 'assistant',
          content:
            "That's a really compelling idea! Seeing how your essays stack up against successful ones — even anonymised — would give you a concrete benchmark. We'd need to handle privacy carefully, but this could be incredibly motivating. Adding as a feature request.",
        },
        {
          role: 'user',
          content: 'Like a score breakdown? Not just overall but by section.',
        },
        {
          role: 'assistant',
          content:
            "Exactly — section-by-section scoring against the benchmark would be far more actionable than a single score. 'Your opening hook is in the 80th percentile, but the conclusion could be stronger' is so much more useful. Great refinement of the idea.",
        },
      ],
    },
    {
      tester_name: 'Sofia K.',
      tester_id: 'tester_sofia_k',
      started_at: daysAgo(9),
      last_message_at: daysAgo(9),
      message_count: 6,
      ai_summary:
        'Calendar sync is a critical missing feature. User manages 15+ deadlines across CommonApp, individual schools, and scholarship portals with no export option.',
      theme_names: ['Integrations', 'Feature Requests'],
      github_issue_number: 24,
      status: 'resolved',
      messages: [
        {
          role: 'user',
          content: "The deadline tracker doesn't sync with my Google Calendar",
        },
        {
          role: 'assistant',
          content:
            "Calendar sync is definitely something we hear a lot! Right now deadlines live only inside PostPrep. A two-way sync — or at least an .ics export — would be a huge quality-of-life improvement. Flagging this now.",
        },
        {
          role: 'user',
          content: 'I have like 15 schools plus scholarships, managing it all separately is chaos',
        },
        {
          role: 'assistant',
          content:
            "15 schools plus scholarships — that's an enormous amount to track! This makes the sync feature feel even more critical. I've raised it as a high-priority request with full context.",
        },
        { role: 'user', content: 'Even just an ics export would help' },
        {
          role: 'assistant',
          content:
            "Absolutely — an .ics export is much simpler to build than full two-way sync, and would solve 90% of the problem. I've noted that as the MVP approach. Great suggestion.",
        },
      ],
    },
    {
      tester_name: 'Jordan M.',
      tester_id: 'tester_jordan_m',
      started_at: daysAgo(8),
      last_message_at: daysAgo(8),
      message_count: 3,
      ai_summary:
        'User appreciates AI suggestions but finds them generic — vague meta-feedback without pointing to specific passages or suggesting concrete improvements.',
      theme_names: ['AI Quality'],
      github_issue_number: null,
      status: 'open',
      messages: [
        {
          role: 'user',
          content: 'Love the AI suggestions but sometimes they sound too generic',
        },
        {
          role: 'assistant',
          content:
            "Thanks for the honest feedback — 'too generic' is something we really want to improve. The AI should be tailored to your specific background, target schools, and experiences. Can you share an example of advice that felt generic?",
        },
        {
          role: 'user',
          content: "Like it told me to 'be more specific' but didn't say WHERE to be specific",
        },
        {
          role: 'assistant',
          content:
            "That's a perfect example — vague meta-feedback like 'be more specific' without pointing to the exact sentence is frustrating. The AI should highlight the actual passage and suggest what detail to add. I've logged this with your example — great data point.",
        },
      ],
    },
    {
      tester_name: 'Priya V.',
      tester_id: 'tester_priya_v',
      started_at: daysAgo(7),
      last_message_at: daysAgo(6),
      message_count: 5,
      ai_summary:
        'User heavily uses app for essay prep but wants dedicated interview tools — mock question banks, practice tracking, and AI feedback on recorded answers.',
      theme_names: ['Feature Requests'],
      github_issue_number: null,
      status: 'open',
      messages: [
        { role: 'user', content: 'Can you add a feature to track interview prep?' },
        {
          role: 'assistant',
          content:
            "Interview prep tracking is a great idea! Right now we focus on essays and deadlines. A dedicated section — with school-specific question banks, practice tracking, and AI feedback — could be really valuable. How are you managing interview prep now?",
        },
        {
          role: 'user',
          content: 'Just a notes doc. I wish I could practice answering common questions and get feedback',
        },
        {
          role: 'assistant',
          content:
            "Mock interview questions with AI feedback on typed (or recorded) practice answers — that would be a genuinely powerful addition. Adding this as a feature request with your use case.",
        },
        {
          role: 'user',
          content: 'Recording would be cool too — like a mock interview mode',
        },
      ],
    },
    {
      tester_name: 'Alex W.',
      tester_id: 'tester_alex_w',
      started_at: daysAgo(5),
      last_message_at: daysAgo(5),
      message_count: 6,
      ai_summary:
        'Critical mobile layout bugs on iPhone 14 Safari: toolbar overlaps essay text and bottom nav disappears when keyboard is open. High frustration; mobile is their primary device.',
      theme_names: ['UX / Mobile', 'Performance'],
      github_issue_number: 25,
      status: 'resolved',
      messages: [
        { role: 'user', content: 'The mobile experience is pretty rough, lots of layout issues' },
        {
          role: 'assistant',
          content:
            "Really sorry to hear that — mobile quality is critical. Can you tell me what device and browser you're using? And which part of the app is worst?",
        },
        {
          role: 'user',
          content: 'iPhone 14, Safari. The essay editor text overlaps with the toolbar',
        },
        {
          role: 'assistant',
          content:
            "Toolbar overlap on the essay editor in Safari — that's likely a CSS viewport issue with the notch/dynamic island. Logging this as a high-priority bug with your device details.",
        },
        { role: 'user', content: 'Also the bottom nav disappears when the keyboard pops up' },
        {
          role: 'assistant',
          content:
            "The keyboard pushing the bottom nav off-screen is a classic iOS Safari issue — the viewport height changes when the keyboard appears. This needs a `dvh` units fix or `window.visualViewport`. Added to the report. Both are fixable!",
        },
      ],
    },
    {
      tester_name: 'Devon L.',
      tester_id: 'tester_devon_l',
      started_at: daysAgo(3),
      last_message_at: daysAgo(3),
      message_count: 4,
      ai_summary:
        'User wants visible word count targets in the editor — current count vs. prompt limit, with colour warnings near and over the limit.',
      theme_names: ['Feature Requests', 'UX / Mobile'],
      github_issue_number: null,
      status: 'open',
      messages: [
        {
          role: 'user',
          content: 'It would be great to have word count targets shown in the editor',
        },
        {
          role: 'assistant',
          content:
            "Word count targets would be a great addition! Each essay prompt has a different limit (CommonApp is 650, supplementals vary). Showing current count vs. target — with a colour indicator when you're over — would be very helpful.",
        },
        {
          role: 'user',
          content: "Yes and also like a 'danger zone' warning when you're getting close to the limit",
        },
        {
          role: 'assistant',
          content:
            "Yellow at 90%, red at 100%+, maybe a shake animation when you exceed it — that's a clear, intuitive pattern. Raised this as a feature request with your exact requirements.",
        },
      ],
    },
    {
      tester_name: 'Riley C.',
      tester_id: 'tester_riley_c',
      started_at: daysAgo(1),
      last_message_at: hoursAgo(8),
      message_count: 3,
      ai_summary:
        'User asking about school-specific guidance — what MIT values vs. other schools. Currently the AI gives only general advice; school-specific style guides would be valuable.',
      theme_names: ['AI Quality', 'Feature Requests'],
      github_issue_number: null,
      status: 'open',
      messages: [
        {
          role: 'user',
          content: 'Does the AI know about specific school cultures and what they look for?',
        },
        {
          role: 'assistant',
          content:
            "Great question! Currently the AI gives general college essay advice, but school-specific guidance — what MIT values vs. a liberal arts school — is an area we want to develop. What schools are you working on?",
        },
        { role: 'user', content: 'MIT mainly. I hear they care a lot about intellectual curiosity' },
        {
          role: 'assistant',
          content:
            "MIT is a great example — they look for genuine intellectual curiosity, problem-solving, and independent thinking. I've noted that school-specific style guides would be really valuable for users targeting technical schools. Great feedback.",
        },
      ],
    },
  ]

  // Insert sessions (without messages)
  const sessionRows = SESSION_DEFS.map(({ messages: _, theme_names, ...s }) => ({
    ...s,
    project_id: projectId,
    ai_themes: theme_names.map(themeId),
  }))

  const { data: sessions, error: sessionsError } = await db
    .from('feedback_sessions')
    .insert(sessionRows)
    .select()

  if (sessionsError || !sessions) {
    console.error('❌  Failed to create sessions:', sessionsError?.message)
    process.exit(1)
  }
  console.log(`✔  Created ${sessions.length} feedback sessions`)

  // Insert messages
  const messageRows: Array<{
    session_id: string
    role: string
    content: string
    created_at: string
  }> = []

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i]
    const { messages } = SESSION_DEFS[i]
    const baseTime = new Date(session.started_at as string).getTime()
    for (let j = 0; j < messages.length; j++) {
      messageRows.push({
        session_id: session.id as string,
        role: messages[j].role,
        content: messages[j].content,
        created_at: new Date(baseTime + j * 2 * 60 * 1000).toISOString(),
      })
    }
  }

  const { error: messagesError } = await db.from('feedback_messages').insert(messageRows)
  if (messagesError) {
    console.error('❌  Failed to create messages:', messagesError.message)
    process.exit(1)
  }
  console.log(`✔  Created ${messageRows.length} feedback messages`)

  // ── 5. Pipeline runs ─────────────────────────────────────────────────────

  const runRows = [
    {
      project_id: projectId,
      github_issue_number: 23,
      github_pr_number: 31,
      stage: 'deployed',
      triggered_by: 'Emma R.',
      started_at: daysAgo(11),
      completed_at: new Date(new Date(daysAgo(11)).getTime() + 18 * 60 * 1000).toISOString(),
      result: 'success',
    },
    {
      project_id: projectId,
      github_issue_number: 24,
      github_pr_number: 34,
      stage: 'deployed',
      triggered_by: 'Sofia K.',
      started_at: daysAgo(9),
      completed_at: new Date(new Date(daysAgo(9)).getTime() + 22 * 60 * 1000).toISOString(),
      result: 'success',
    },
    {
      project_id: projectId,
      github_issue_number: 25,
      github_pr_number: 37,
      stage: 'preview_ready',
      triggered_by: 'Alex W.',
      started_at: daysAgo(5),
      completed_at: null,
      result: null,
    },
    {
      project_id: projectId,
      github_issue_number: 26,
      github_pr_number: null,
      stage: 'running',
      triggered_by: 'Auto',
      started_at: hoursAgo(2),
      completed_at: null,
      result: null,
    },
    {
      project_id: projectId,
      github_issue_number: 27,
      github_pr_number: null,
      stage: 'validating',
      triggered_by: 'Auto',
      started_at: hoursAgo(1),
      completed_at: null,
      result: null,
    },
    {
      project_id: projectId,
      github_issue_number: 28,
      github_pr_number: 40,
      stage: 'failed',
      triggered_by: 'Auto',
      started_at: daysAgo(2),
      completed_at: new Date(new Date(daysAgo(2)).getTime() + 8 * 60 * 1000).toISOString(),
      result: 'failed',
    },
  ]

  const { data: runs, error: runsError } = await db
    .from('pipeline_runs')
    .insert(runRows)
    .select()

  if (runsError || !runs) {
    console.error('❌  Failed to create pipeline runs:', runsError?.message)
    process.exit(1)
  }
  console.log(`✔  Created ${runs.length} pipeline runs`)

  // Add run logs for the active (running) job
  const runningRun = runs.find((r) => r.stage === 'running')
  if (runningRun) {
    const logRows = [
      {
        run_id: runningRun.id as string,
        level: 'info',
        message: '🚀  Starting implementation job',
        timestamp: minutesAgo(110),
      },
      {
        run_id: runningRun.id as string,
        level: 'info',
        message: 'Cloning repository nikitadmitrieff/postprep-demo…',
        timestamp: minutesAgo(109),
      },
      {
        run_id: runningRun.id as string,
        level: 'info',
        message: '✓  Repository cloned successfully',
        timestamp: minutesAgo(108),
      },
      {
        run_id: runningRun.id as string,
        level: 'info',
        message: 'Installing dependencies (npm ci)…',
        timestamp: minutesAgo(107),
      },
      {
        run_id: runningRun.id as string,
        level: 'info',
        message: '✓  Dependencies installed (47 packages)',
        timestamp: minutesAgo(102),
      },
      {
        run_id: runningRun.id as string,
        level: 'info',
        message: '🤖  Starting Claude CLI…',
        timestamp: minutesAgo(101),
      },
      {
        run_id: runningRun.id as string,
        level: 'info',
        message: 'Analysing codebase structure…',
        timestamp: minutesAgo(98),
      },
      {
        run_id: runningRun.id as string,
        level: 'info',
        message: 'Reading src/components/EssayEditor.tsx…',
        timestamp: minutesAgo(95),
      },
      {
        run_id: runningRun.id as string,
        level: 'info',
        message: 'Implementing word count indicator with colour states…',
        timestamp: minutesAgo(80),
      },
    ]
    await db.from('run_logs').insert(logRows)
    console.log(`✔  Created ${logRows.length} run logs for active run`)
  }

  // ── 6. Proposals ─────────────────────────────────────────────────────────

  const now = new Date().toISOString()

  const proposalRows = [
    {
      project_id: projectId,
      title: 'Progress bar for AI feedback generation',
      rationale:
        'Multiple testers reported confusion when AI feedback takes 8–15 seconds with no visible loading state. Two users refreshed the page thinking it had frozen, losing their work.',
      spec: `## Overview
Add a multi-step progress indicator to the AI essay feedback flow.

## Implementation
- Show a progress bar below the essay editor when feedback is generating
- Display granular step labels: "Reading essay…" → "Analysing structure…" → "Checking tone…" → "Generating suggestions…"
- Each step animates with a smooth fill
- On completion, bar fades out and feedback slides in

## Technical notes
- The feedback stream starts immediately; steps can be inferred from token batches
- Use simulated progress with realistic timing if streaming doesn't expose step boundaries
- Mobile: ensure the progress bar doesn't obscure the essay text`,
      priority: 'high',
      status: 'draft',
      scores: { impact: 0.85, feasibility: 0.92, novelty: 0.55, alignment: 0.88 },
      source_theme_ids: [themeId('Performance'), themeId('Feature Requests')],
      created_at: daysAgo(6),
    },
    {
      project_id: projectId,
      title: 'Google Calendar integration for deadline sync',
      rationale:
        'Sofia K. manages 15+ school deadlines across CommonApp, individual portals, and scholarships. The deadline tracker is a silo with no export or sync.',
      spec: `## Overview
Add Google Calendar sync for the deadline tracker.

## MVP: .ics export
- "Export to Calendar" button on the deadline tracker page
- Generates an .ics file with all upcoming deadlines
- Works with any calendar app (Google, Apple, Outlook)

## Phase 2: Two-way sync
- OAuth with Google Calendar
- Auto-create events for new deadlines
- Push updates when deadlines change
- Delete events when deadlines are removed from PostPrep

## Priority
Ship the .ics export first — covers 90% of the value with 10% of the complexity.`,
      priority: 'high',
      status: 'implementing',
      scores: { impact: 0.92, feasibility: 0.78, novelty: 0.62, alignment: 0.9 },
      source_theme_ids: [themeId('Integrations'), themeId('Feature Requests')],
      github_issue_number: 29,
      created_at: daysAgo(5),
      reviewed_at: daysAgo(3),
    },
    {
      project_id: projectId,
      title: "Show accepted students' essay themes (anonymised)",
      rationale:
        "Marcus T. explicitly requested benchmarking against successful applications. This would help students understand which themes and approaches resonate with top schools.",
      spec: `## Overview
Add an anonymised "Inspiration" browser to help students understand what works.

## Data model
- Curated, anonymised essay snippets tagged by school, theme, and prompt
- Each snippet shows: school tier, year, admitted status, theme tags

## UI
- "Inspiration" tab in the essay editor sidebar
- Filter by school, prompt type, and theme
- Shows 3–5 anonymous excerpts with the relevant theme highlighted

## Privacy
- Opt-in voluntary submissions from admitted students
- All identifying details removed before storage`,
      priority: 'medium',
      status: 'draft',
      scores: { impact: 0.78, feasibility: 0.61, novelty: 0.82, alignment: 0.72 },
      source_theme_ids: [themeId('Feature Requests')],
      created_at: daysAgo(4),
    },
    {
      project_id: projectId,
      title: 'Essay word count with target indicators',
      rationale:
        'Devon L. requested visible word count targets. CommonApp has a 650-word limit; many supplementals differ. Students need live guidance while writing.',
      spec: `## Overview
Add a word count indicator to the essay editor with visual feedback.

## Features
- Live word count in the editor toolbar
- Target range based on the selected prompt (e.g. "450–650 words")
- Colour states: green (on track), yellow (within 50 of limit), red (over limit)
- Tooltip showing exact count and target

## Mobile
- Sticky count badge at the bottom when the keyboard is visible
- Real-time updates as the user types`,
      priority: 'medium',
      status: 'done',
      scores: { impact: 0.8, feasibility: 0.95, novelty: 0.45, alignment: 0.85 },
      source_theme_ids: [themeId('Feature Requests'), themeId('UX / Mobile')],
      github_issue_number: 30,
      branch_name: 'feat/word-count-indicator',
      created_at: daysAgo(14),
      reviewed_at: daysAgo(12),
      completed_at: daysAgo(8),
    },
    {
      project_id: projectId,
      title: 'Fix mobile essay editor layout (iOS Safari)',
      rationale:
        'Alex W. reported critical iOS Safari bugs: toolbar overlaps essay text and bottom nav disappears when the keyboard appears. Affects the 70% of users on mobile.',
      spec: `## Overview
Fix iOS Safari-specific layout bugs in the essay editor.

## Bugs to fix
1. **Toolbar overlap** — essay text overlaps the formatting toolbar on iPhone 14 Safari
   - Cause: fixed positioning doesn't account for the notch/dynamic island
   - Fix: add \`safe-area-inset\` to toolbar padding

2. **Keyboard pushes bottom nav off screen**
   - Cause: standard viewport height doesn't account for the keyboard
   - Fix: use \`dvh\` units or \`window.visualViewport\` API

## Testing
- iPhone 14 Safari + at least one Android device
- Verify toolbar visible at all scroll positions
- Verify bottom nav accessible when keyboard is open`,
      priority: 'high',
      status: 'rejected',
      scores: { impact: 0.88, feasibility: 0.9, novelty: 0.3, alignment: 0.82 },
      source_theme_ids: [themeId('UX / Mobile')],
      reject_reason: 'Already fixed in PR #37 — this was a duplicate proposal.',
      created_at: daysAgo(3),
      reviewed_at: now,
    },
  ]

  const { data: proposals, error: proposalsError } = await db
    .from('proposals')
    .insert(proposalRows)
    .select()

  if (proposalsError || !proposals) {
    console.error('❌  Failed to create proposals:', proposalsError?.message)
    process.exit(1)
  }
  console.log(`✔  Created ${proposals.length} proposals`)

  // ── Summary ──────────────────────────────────────────────────────────────

  console.log('\n🎉  Demo seed complete!\n')
  console.log('─'.repeat(52))
  console.log(`  Project ID    ${projectId}`)
  console.log(`  Themes        ${themes.length}`)
  console.log(`  Sessions      ${sessions.length}`)
  console.log(`  Messages      ${messageRows.length}`)
  console.log(`  Pipeline runs ${runs.length}`)
  console.log(`  Proposals     ${proposals.length}`)
  console.log('─'.repeat(52))
  console.log('\nOpen the dashboard and select this project to see the demo data.')
  console.log(`  npm run dev  →  http://localhost:3001/projects/${projectId}\n`)
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
