# Simplify Project Form Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove `github_repo` and Claude credential fields from "New Project" form — detect repo from GitHub App installation, use system Claude credential as fallback.

**Architecture:** (1) Migration makes `github_repo` nullable. (2) New project form becomes name-only. (3) GitHub App callback auto-detects repo via Octokit. (4) Agent worker falls back to system `CLAUDE_CREDENTIALS_JSON`/`ANTHROPIC_API_KEY` instead of throwing when no per-project credential exists.

**Tech Stack:** Next.js 15 App Router, Supabase (feedback_chat schema), @octokit/app, existing oauth.ts auto-refresh.

---

## Task 1: Migration — make github_repo nullable

**Files:**
- Create: `packages/dashboard/supabase/migrations/00006_nullable_github_repo.sql`

**Step 1: Write migration**

```sql
ALTER TABLE projects ALTER COLUMN github_repo DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN github_repo SET DEFAULT '';
```

**Step 2: Apply via Supabase MCP (project: lilcfbtohnhegxmpcfpb)**

**Step 3: Commit**

```bash
git add packages/dashboard/supabase/migrations/00006_nullable_github_repo.sql
git commit -m "feat(db): make github_repo nullable for GitHub App auto-detect"
```

---

## Task 2: Simplify new project form

**Files:**
- Modify: `packages/dashboard/src/app/projects/new/page.tsx`

Remove `github_repo`, `credential_type`, `credential_value` inputs and their DB inserts. Keep only `name`.

**Step 1: Rewrite the file**

**Step 2: tsc --noEmit**

**Step 3: Commit**

```bash
git add packages/dashboard/src/app/projects/new/page.tsx
git commit -m "feat(dashboard): simplify new project form — name only"
```

---

## Task 3: Auto-detect github_repo in GitHub App callback

**Files:**
- Modify: `packages/dashboard/src/app/auth/github-app/setup/route.ts`

After saving `github_installation_id`, call `getInstallationOctokit` to list repos and save first as `github_repo`.

**Step 1: Rewrite callback**

**Step 2: tsc --noEmit**

**Step 3: Commit**

```bash
git add packages/dashboard/src/app/auth/github-app/setup/route.ts
git commit -m "feat(dashboard): auto-detect github_repo from installation repos"
```

---

## Task 4: Agent — system Claude credential fallback + startup refresh

**Files:**
- Modify: `packages/agent/src/managed-worker.ts`
- Modify: `packages/agent/src/setup-worker.ts`

`fetchCredentials`: if no DB row, fall back to `CLAUDE_CREDENTIALS_JSON`/`ANTHROPIC_API_KEY` env.
Worker startup: call `initCredentials()` + `ensureValidToken()` once.
`setup-worker`: same fallback when no project credential found.

**Step 1: Edit managed-worker.ts**

**Step 2: Edit setup-worker.ts**

**Step 3: tsc --noEmit on agent**

**Step 4: Commit**

```bash
git add packages/agent/src/managed-worker.ts packages/agent/src/setup-worker.ts
git commit -m "feat(agent): fall back to system Claude credential, refresh at startup"
```

---

## Task 5: Create minimal test repo and push to GitHub

Create a bare-bones Next.js 15 app (just the defaults from create-next-app output, no extra deps) and push it to `NikitaDmitrieff/feedback-chat-test`.

**Step 1: Create repo on GitHub via gh CLI**

**Step 2: Scaffold minimal Next.js app files manually (no npm, just the files)**

**Step 3: Init git, commit, push**
