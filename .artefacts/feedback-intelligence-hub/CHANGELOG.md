# Feedback Intelligence Hub — Changelog

## Summary

Added a Feedback Intelligence Hub to the dashboard: a feedback inbox with AI-powered theme clustering, tester activity view, and AI digest. The widget gains optional Supabase persistence for conversations.

## New Files

### Supabase Migration
- `packages/dashboard/supabase/migrations/00004_feedback_tables.sql` — feedback_sessions, feedback_messages, feedback_themes tables with indexes and RLS

### Dashboard API Routes
- `packages/dashboard/src/app/api/feedback/[projectId]/route.ts` — List sessions (GET with theme/tester/status filters)
- `packages/dashboard/src/app/api/feedback/[projectId]/[sessionId]/route.ts` — Session messages (GET) + status update (PATCH)
- `packages/dashboard/src/app/api/feedback/[projectId]/classify/route.ts` — AI classification via Claude Haiku (POST)
- `packages/dashboard/src/app/api/feedback/[projectId]/digest/route.ts` — AI digest generation (GET with day/week period)
- `packages/dashboard/src/app/api/feedback/[projectId]/testers/route.ts` — Tester activity summaries (GET)

### Dashboard Components
- `packages/dashboard/src/components/digest-card.tsx` — AI Digest card with stats, day/week toggle, refresh
- `packages/dashboard/src/components/feedback-list.tsx` — Session list with theme pill filters, status dots, time ago
- `packages/dashboard/src/components/feedback-slide-over.tsx` — Thread slide-over with messages, classify/resolve/dismiss actions
- `packages/dashboard/src/components/tester-activity.tsx` — Tester cards with session counts, theme pills, resolution rate bars

### Dashboard Pages
- `packages/dashboard/src/app/projects/[id]/feedback/page.tsx` — Server component with breadcrumb and data fetching
- `packages/dashboard/src/app/projects/[id]/feedback/client.tsx` — Client wrapper orchestrating all feedback components

### Shared Utilities
- `packages/dashboard/src/lib/format.ts` — Shared `timeAgo` utility

## Modified Files

- `packages/dashboard/src/lib/types.ts` — Added FeedbackSession, FeedbackMessage, FeedbackTheme, TesterSummary types
- `packages/dashboard/src/components/sidebar.tsx` — Added contextual Feedback link (visible inside projects)
- `packages/dashboard/src/app/projects/[id]/page.tsx` — Added DigestCard between StatsBar and SetupChecklist
- `packages/dashboard/package.json` — Added @ai-sdk/anthropic, ai, zod dependencies
- `packages/widget/src/server/handler.ts` — Added optional Supabase feedback persistence (fire-and-forget)

## Code Simplification (post-implementation)

- Destructured `searchParams` directly in feedback list route (removed intermediate `url` variable)
- Inlined `body` destructuring in session detail PATCH handler
- Parallelized independent Supabase queries with `Promise.all` in digest route
- Converted `usedColors` to a `Set` for O(1) lookups in classify route, hoisted outside loop
- Inlined redundant `typedMessages` variable in classify route (null already guarded)
- Fixed operator precedence bug in themes prop cast on feedback page (`(themes ?? []) as` instead of `(themes as) ?? []`)

## Breaking Changes

None. All changes are additive. The widget's Supabase persistence is opt-in via the `supabase` config option.

## Dependencies Added

- `@ai-sdk/anthropic` — Claude API provider for AI SDK
- `ai` — Vercel AI SDK v6 for generateObject/generateText
- `zod` — Schema validation for AI classification output
