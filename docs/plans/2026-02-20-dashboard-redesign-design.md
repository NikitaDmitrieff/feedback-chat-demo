# Dashboard Redesign: Settings, Enhanced Proposals & Overview Cleanup

**Date:** 2026-02-20
**Status:** Approved

## Summary

Three changes to make the dashboard easier to manage:

1. **New Settings page** — product context (auto-generated from GitHub), strategic nudges, setup config (moved from overview)
2. **Enhanced Proposals page** — quick idea box, structured "Create Proposal" form, user proposals alongside AI proposals
3. **Cleaned Overview page** — remove setup section, add contextual banners pointing to Settings

## Approach

**Approach A: Settings page + Enhanced Proposals** was chosen over two alternatives:
- Approach B (merge Proposals + Pipeline into a single "Strategy" page with tabs) — rejected because tabs-within-pages adds complexity
- Approach C (contextual panels on existing pages) — rejected because scattered config is hard to find

---

## Design

### 1. Settings Page

**Route:** `/projects/[id]/settings`
**Sidebar:** New "Settings" item (gear icon), placed last before sign-out.

#### Section 1: Product Context (auto-generated + editable)

On project creation or first visit, a "Generate" button triggers a server action:
- Fetches README, package.json/pyproject.toml, directory tree (depth 2), and last 20 issue titles via the GitHub App installation token
- Sends to Haiku: "Summarize this product in 2-3 paragraphs: what it is, who it's for, tech stack, current development priorities"
- Writes result to `projects.product_context`

Display:
- Card with the generated text
- "Edit" button switches to a textarea for user refinement
- "Regenerate" button re-runs GitHub analysis (with confirmation)
- Save persists to `projects.product_context`

#### Section 2: Strategic Nudges (persistent directives)

Standing directives that guide all future strategize runs (e.g., "Focus on mobile UX", "Ignore performance for now", "Prioritize onboarding flow").

- List of active nudges, each a short text string
- "Add nudge" text input + button
- Each nudge has a delete (x) button
- Stored in `projects.strategic_nudges` (text array)
- Strategize worker includes these as "User directives — these override default priorities" in the prompt

#### Section 3: Setup & Configuration (moved from Overview)

The existing SetupSection component (auto/manual toggle, SetupWizard, SetupChecklist), relocated from the overview page. Shows current status: GitHub App connected, agent deployed, webhook active.

---

### 2. Enhanced Proposals Page

**Route:** `/projects/[id]/proposals` (same URL, enhanced)

#### New: "Your Input" section (above existing proposals list)

**Quick idea box:**
- Single-line text input with "Submit" button
- Placeholder: "Drop an idea or feature direction..."
- Stored in `feedback_chat.user_ideas` table
- On next strategize run, pending ideas are included in the prompt
- Ideas that influenced a proposal are marked `incorporated`

**"Create Proposal" button:**
- Opens a slide-over (reusing ProposalSlideOver pattern) with form: title, description/spec, priority
- Inserts directly into `proposals` table with `status: 'draft'`, `scores: null`
- Shows in "Pending Review" with a "User" badge instead of score bar

**Idea status display:**
- Below the idea box, collapsible list of recent ideas with status pills: `pending`, `incorporated`, `dismissed`

#### Existing sections — minor tweaks:

- AI proposals show score bars as today
- User proposals show "User" badge instead of scores
- Both flow through the same approve/reject mechanism
- Approved user proposals create GitHub issues identically

---

### 3. Overview Page Cleanup

**Remove:** SetupSection (moved to Settings). If setup is incomplete, show a single-line banner: "Setup incomplete — Go to Settings" with a link.

**Keep:** Stats bar, AI Digest card, Proposals card, Runs table.

**Add:** If `product_context` is empty, show a subtle prompt card: "Set up your product context to improve proposal quality — Go to Settings". Disappears once populated.

---

### 4. Sidebar Navigation

**New sidebar (5 items):**
1. Overview
2. Feedback
3. Proposals
4. Pipeline
5. Settings (gear icon) — new, last position before sign-out

---

## Data Model Changes

### Modified table: `projects`

Add column:
```sql
ALTER TABLE feedback_chat.projects
ADD COLUMN strategic_nudges text[] DEFAULT '{}';
```

### New table: `user_ideas`

```sql
CREATE TABLE feedback_chat.user_ideas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES feedback_chat.projects(id) ON DELETE CASCADE,
  text        text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'incorporated', 'dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

---

## API Changes

### New routes:

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/projects/[id]/context/generate` | Trigger GitHub repo analysis, write `product_context` |
| PATCH | `/api/projects/[id]/settings` | Update `product_context` and `strategic_nudges` |
| POST | `/api/projects/[id]/ideas` | Create a user idea |
| GET | `/api/projects/[id]/ideas` | List user ideas (with status filter) |

### Modified code:

**`strategize-worker.ts`:**
- Include `projects.strategic_nudges` in prompt as "User directives" section
- Fetch pending `user_ideas`, include as "User-submitted ideas to consider"
- After generating proposals, mark ideas as `incorporated` if they influenced a proposal (or `dismissed` after 3 runs without incorporation)
