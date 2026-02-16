# Feedback Intelligence Hub — Manual Testing Guide

## Prerequisites

- Dashboard running locally (`cd packages/dashboard && npm run dev`)
- Supabase project with migration `00004_feedback_tables.sql` applied
- A project created in the dashboard
- `ANTHROPIC_API_KEY` set in `packages/dashboard/.env.local` (for AI classification/digest)

## Test 1: Supabase Tables Exist

**Steps:**
1. Open your Supabase dashboard → SQL Editor
2. Run: `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'feedback_%'`

**Expected:** Three tables: `feedback_sessions`, `feedback_messages`, `feedback_themes`

## Test 2: Sidebar Feedback Link

**Steps:**
1. Navigate to `/projects` — sidebar should NOT show a Feedback link
2. Click into a project (`/projects/[id]`)
3. Look at the sidebar

**Expected:** A "Feedback" link with MessageSquare icon appears between "Projects" and the divider. It links to `/projects/[id]/feedback`.

**Edge case:** The link should highlight (active state) when on the feedback page.

## Test 3: Digest Card on Project Page

**Steps:**
1. Navigate to `/projects/[id]`
2. Look between StatsBar and SetupChecklist

**Expected:** A glass-card with "AI Digest" header, Day/Week toggle, Refresh button, stats row (total/attention/resolved), and AI digest text. If no feedback data exists, shows "No feedback received this period."

**Edge case:** Toggle between Day and Week — the card re-fetches and updates stats.

## Test 4: Feedback Page — Empty State

**Steps:**
1. Navigate to `/projects/[id]/feedback`

**Expected:**
- Breadcrumb: arrow + project name linking back to `/projects/[id]`
- "Feedback" heading
- DigestCard at top
- Conversations / Testers tab toggle
- Empty state: MessageCircle icon with "No feedback sessions yet" message
- Testers tab: Users icon with empty state

## Test 5: Feedback List API

**Steps:**
1. Insert a test row into `feedback_sessions`: `INSERT INTO feedback_sessions (project_id, tester_name, status) VALUES ('<your-project-id>', 'Test User', 'open')`
2. Refresh the feedback page

**Expected:** The session appears in the list with:
- Green status dot (open)
- "Conversation with Test User" fallback text (no AI summary)
- Tester name + time ago
- Message count (0)

**Edge case:** Add `?status=resolved` to the API URL — the open session should not appear.

## Test 6: Session Detail + Slide-Over

**Steps:**
1. Insert test messages: `INSERT INTO feedback_messages (session_id, role, content) VALUES ('<session-id>', 'user', 'I have a bug'), ('<session-id>', 'assistant', 'Can you describe the bug?')`
2. Click on the session in the list

**Expected:**
- Slide-over opens from the right (480px wide, with backdrop)
- Header shows tester name + message count
- Messages display: user message right-aligned (accent bg), assistant left-aligned (surface bg)
- Action bar: "Classify" button (since no AI summary), "Resolve" and "Dismiss" buttons

**Edge cases:**
- Press Escape — slide-over closes
- Click backdrop — slide-over closes

## Test 7: AI Classification

**Steps:**
1. Open a session slide-over (must have messages)
2. Click "Classify" button

**Expected:**
- Button shows loading state
- After a few seconds: AI summary appears in the slide-over header area
- Theme pills appear under the summary
- The "Classify" button disappears (summary now exists)
- New themes appear in `feedback_themes` table

**Edge case:** Classify a second session with similar content — the existing theme should be reused (count incremented), not duplicated.

## Test 8: Resolve / Dismiss Actions

**Steps:**
1. Open an "open" session's slide-over
2. Click "Resolve"

**Expected:** Status dot changes to green checkmark, Resolve/Dismiss buttons disappear.

**Steps:**
1. Open another "open" session
2. Click "Dismiss"

**Expected:** Status dot changes to gray, buttons disappear.

## Test 9: Theme Filtering

**Steps:**
1. Classify at least 2 sessions (so themes exist)
2. On the feedback page, look at theme pills above the session list
3. Click a theme pill

**Expected:** Session list filters to only show sessions tagged with that theme. "All" pill deselects. Click again to return to all.

## Test 10: AI Digest with Data

**Steps:**
1. With feedback sessions present, look at the DigestCard
2. Click Refresh

**Expected:** Stats update (total count > 0), AI digest shows 3-5 actionable sentences.

## Test 11: Tester Activity Tab

**Steps:**
1. Create sessions with different `tester_id`/`tester_name` values
2. Navigate to `/projects/[id]/feedback`, click "Testers" tab

**Expected:**
- Header: "{N} tester(s) active"
- Tester cards with name, conversation count, last active time
- Top theme pills (if classified)
- Resolution rate progress bar
- Click a tester card → tab switches back to Conversations (future: could filter by tester)

## Test 12: Widget Supabase Persistence

**Steps:**
1. Configure the widget's `createFeedbackHandler` with `supabase: { url, serviceRoleKey, projectId }`
2. Send a message through the widget

**Expected:**
- Chat works normally (persistence is fire-and-forget)
- After the conversation, check `feedback_sessions` and `feedback_messages` — rows should exist
- The session should have the correct `project_id` and `message_count`

**Edge case:** If Supabase is unreachable, the chat should still work (no errors shown to user).

## Test 13: GitHub Issue Link

**Steps:**
1. If a session has `github_issue_number` set, open its slide-over

**Expected:** A link to the GitHub issue appears below the AI summary section (requires `githubRepo` prop).
