# QA Onboarding Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automated QA loop that tests the dashboard onboarding flow end-to-end, files GitHub issues when steps break, and re-tests after fixes are deployed.

**Architecture:** A GitHub Actions workflow runs a Playwright E2E test suite against the live dashboard (`loop.joincoby.com`). On failure, it files a GitHub issue with `feedback-bot` + `auto-implement` labels, which the existing Railway agent picks up and fixes. When the issue is closed (fix merged + deployed), the workflow re-triggers automatically.

**Tech Stack:** Playwright (E2E browser testing), GitHub Actions (CI runner), Vitest (unit tests for test utilities)

**Important:** The agent uses Claude OAuth credentials (`claude_oauth` type), NOT Anthropic API keys. The managed worker in `packages/agent/src/managed-worker.ts` routes credentials by type — `claude_oauth` → `CLAUDE_CREDENTIALS_JSON` env var, `anthropic_api_key` → `ANTHROPIC_API_KEY` env var.

---

### Task 1: Install Playwright and create test config

**Files:**
- Modify: `packages/dashboard/package.json`
- Create: `packages/dashboard/playwright.config.ts`
- Create: `packages/dashboard/.gitignore` (append Playwright artifacts)

**Step 1: Install Playwright**

```bash
cd packages/dashboard
npm install --save-dev @playwright/test
npx playwright install chromium
```

**Step 2: Create Playwright config**

Create `packages/dashboard/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.DASHBOARD_URL || 'http://localhost:3001',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
})
```

**Step 3: Add test script to package.json**

Add to `packages/dashboard/package.json` scripts:

```json
"test:e2e": "playwright test",
"test:e2e:headed": "playwright test --headed"
```

**Step 4: Append Playwright artifacts to .gitignore**

Append to `packages/dashboard/.gitignore`:

```
test-results/
playwright-report/
```

**Step 5: Verify Playwright runs (empty suite)**

```bash
cd packages/dashboard
npx playwright test
```

Expected: 0 tests, no errors.

**Step 6: Commit**

```bash
git add packages/dashboard/package.json packages/dashboard/playwright.config.ts packages/dashboard/.gitignore
git commit -m "chore(dashboard): add Playwright E2E test infrastructure"
```

---

### Task 2: Create test account seeding utility

The QA tests need a real account on the dashboard. Rather than hitting the signup flow every time (fragile), we seed a test account directly via Supabase admin API.

**Files:**
- Create: `packages/dashboard/tests/e2e/helpers/seed.ts`

**Step 1: Create seed utility**

Create `packages/dashboard/tests/e2e/helpers/seed.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    db: { schema: 'feedback_chat' },
  })
}

export function authAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

/**
 * Ensure a test user exists and return their credentials.
 * Idempotent — safe to call multiple times.
 */
export async function ensureTestUser() {
  const email = process.env.QA_TEST_EMAIL || 'qa-bot@feedback.chat'
  const password = process.env.QA_TEST_PASSWORD || 'qa-test-password-2026'

  const auth = authAdmin()

  // Try to find existing user
  const { data: { users } } = await auth.auth.admin.listUsers()
  const existing = users.find((u) => u.email === email)

  if (!existing) {
    const { error } = await auth.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw new Error(`Failed to create test user: ${error.message}`)
  }

  return { email, password }
}

/**
 * Clean up projects created by the QA bot.
 * Call after each test run to avoid accumulating test data.
 */
export async function cleanupTestProjects() {
  const supabase = adminClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .like('name', 'qa-test-%')

  if (!projects || projects.length === 0) return

  const ids = projects.map((p) => p.id)

  // Delete in dependency order
  await supabase.from('pipeline_runs').delete().in('project_id', ids)
  await supabase.from('job_queue').delete().in('project_id', ids)
  await supabase.from('credentials').delete().in('project_id', ids)
  await supabase.from('api_keys').delete().in('project_id', ids)
  await supabase.from('projects').delete().in('id', ids)
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/tests/e2e/helpers/seed.ts
git commit -m "test(dashboard): add QA test account seeding utility"
```

---

### Task 3: Write the login E2E test

**Files:**
- Create: `packages/dashboard/tests/e2e/global-setup.ts`
- Create: `packages/dashboard/tests/e2e/onboarding.spec.ts`
- Modify: `packages/dashboard/playwright.config.ts` (add globalSetup)

**Step 1: Create global setup that seeds the test user**

Create `packages/dashboard/tests/e2e/global-setup.ts`:

```ts
import { ensureTestUser, cleanupTestProjects } from './helpers/seed'

export default async function globalSetup() {
  await ensureTestUser()
  await cleanupTestProjects()
}
```

**Step 2: Add globalSetup to Playwright config**

Add to `packages/dashboard/playwright.config.ts` inside `defineConfig({})`:

```ts
globalSetup: './tests/e2e/global-setup.ts',
```

**Step 3: Write the login test**

Create `packages/dashboard/tests/e2e/onboarding.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const EMAIL = process.env.QA_TEST_EMAIL || 'qa-bot@feedback.chat'
const PASSWORD = process.env.QA_TEST_PASSWORD || 'qa-test-password-2026'

test.describe('Onboarding flow', () => {
  test('Step 1: can sign in to the dashboard', async ({ page }) => {
    await page.goto('/login')

    // Should see the login page
    await expect(page.locator('text=Feedback Chat')).toBeVisible()
    await expect(page.locator('text=Sign in')).toBeVisible()

    // Fill credentials
    await page.fill('[placeholder="Email address"]', EMAIL)
    await page.fill('[placeholder="Password"]', PASSWORD)
    await page.click('button[type="submit"]')

    // Should redirect to /projects
    await page.waitForURL('**/projects', { timeout: 10_000 })
    await expect(page.locator('text=Projects')).toBeVisible()
  })
})
```

**Step 4: Run the test locally against the live dashboard**

```bash
cd packages/dashboard
DASHBOARD_URL=https://loop.joincoby.com \
NEXT_PUBLIC_SUPABASE_URL=<from .env.local> \
SUPABASE_SERVICE_ROLE_KEY=<from .env.local> \
npx playwright test onboarding.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/dashboard/tests/e2e/ packages/dashboard/playwright.config.ts
git commit -m "test(dashboard): add login E2E test with global setup"
```

---

### Task 4: Write the project creation E2E test

**Files:**
- Modify: `packages/dashboard/tests/e2e/onboarding.spec.ts`

**Step 1: Add project creation test**

Append to the `test.describe` block in `onboarding.spec.ts`:

```ts
  test('Step 2: can create a new project', async ({ page }) => {
    // Sign in first
    await page.goto('/login')
    await page.fill('[placeholder="Email address"]', EMAIL)
    await page.fill('[placeholder="Password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/projects', { timeout: 10_000 })

    // Click New Project
    await page.click('text=New Project')
    await page.waitForURL('**/projects/new')

    // Fill the form
    const projectName = `qa-test-${Date.now()}`
    await page.fill('input[name="name"]', projectName)
    await page.fill('input[name="github_repo"]', 'NikitaDmitrieff/european-art-vault')

    // Select Claude OAuth
    await page.selectOption('select[name="credential_type"]', 'claude_oauth')

    // Leave credential value empty for now (test creation without creds)
    await page.click('button[type="submit"]')

    // Should redirect to project detail page
    await page.waitForURL(/\/projects\/[a-f0-9-]+/, { timeout: 10_000 })

    // Should see setup checklist
    await expect(page.locator('text=Setup')).toBeVisible()

    // Should see the project name
    await expect(page.locator(`text=${projectName}`)).toBeVisible()
  })
```

**Step 2: Run test**

```bash
cd packages/dashboard
DASHBOARD_URL=https://loop.joincoby.com \
NEXT_PUBLIC_SUPABASE_URL=<from .env.local> \
SUPABASE_SERVICE_ROLE_KEY=<from .env.local> \
npx playwright test onboarding.spec.ts
```

Expected: 2 tests PASS

**Step 3: Commit**

```bash
git add packages/dashboard/tests/e2e/onboarding.spec.ts
git commit -m "test(dashboard): add project creation E2E test"
```

---

### Task 5: Write the setup checklist validation tests

**Files:**
- Modify: `packages/dashboard/tests/e2e/onboarding.spec.ts`
- Create: `packages/dashboard/tests/e2e/helpers/auth.ts` (extract login helper)

**Step 1: Extract login helper to avoid duplication**

Create `packages/dashboard/tests/e2e/helpers/auth.ts`:

```ts
import { Page } from '@playwright/test'

const EMAIL = process.env.QA_TEST_EMAIL || 'qa-bot@feedback.chat'
const PASSWORD = process.env.QA_TEST_PASSWORD || 'qa-test-password-2026'

export async function signIn(page: Page) {
  await page.goto('/login')
  await page.fill('[placeholder="Email address"]', EMAIL)
  await page.fill('[placeholder="Password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/projects', { timeout: 10_000 })
}

export async function createTestProject(page: Page, name?: string) {
  const projectName = name ?? `qa-test-${Date.now()}`
  await page.goto('/projects/new')
  await page.waitForLoadState('networkidle')
  await page.fill('input[name="name"]', projectName)
  await page.fill('input[name="github_repo"]', 'NikitaDmitrieff/european-art-vault')
  await page.selectOption('select[name="credential_type"]', 'claude_oauth')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/projects\/[a-f0-9-]+/, { timeout: 10_000 })
  return { projectName, url: page.url() }
}
```

**Step 2: Add setup checklist validation tests**

Add to `onboarding.spec.ts`:

```ts
import { signIn, createTestProject } from './helpers/auth'

// ... existing tests updated to use signIn() helper ...

  test('Step 3: setup checklist renders with correct URLs', async ({ page }) => {
    await signIn(page)
    const { url } = await createTestProject(page)

    // Verify checklist steps are visible
    await expect(page.locator('text=Install the widget')).toBeVisible()
    await expect(page.locator('text=Add environment variables')).toBeVisible()
    await expect(page.locator('text=Configure GitHub webhook')).toBeVisible()
    await expect(page.locator('text=Create GitHub labels')).toBeVisible()
    await expect(page.locator('text=Send your first feedback')).toBeVisible()
  })

  test('Step 4: Claude prompt has correct domain (not localhost)', async ({ page }) => {
    await signIn(page)
    await createTestProject(page)

    // Find and click the Claude quick setup section
    const quickSetup = page.locator('text=Claude Code Quick Setup')
    if (await quickSetup.isVisible()) {
      await quickSetup.click()
    }

    // Get the prompt text content
    const promptArea = page.locator('pre, [data-prompt], code').first()
    if (await promptArea.isVisible()) {
      const promptText = await promptArea.textContent()

      // Must contain the production domain
      expect(promptText).toContain('loop.joincoby.com')

      // Must NOT contain localhost
      expect(promptText).not.toContain('localhost')

      // Must contain --save in install command
      expect(promptText).toContain('--save')

      // Must reference FEEDBACK_PASSWORD (not FEEDBACK_CHAT_API_KEY)
      expect(promptText).toContain('FEEDBACK_PASSWORD')
    }
  })

  test('Step 5: webhook URL is reachable (no 401)', async ({ page, request }) => {
    await signIn(page)
    await createTestProject(page)

    // Extract webhook URL from the checklist
    const webhookText = await page.locator('text=api/webhook/').first().textContent()
    const webhookMatch = webhookText?.match(/https:\/\/[^\s"'`]+\/api\/webhook\/[a-f0-9-]+/)

    if (webhookMatch) {
      const webhookUrl = webhookMatch[0]

      // Hit the webhook URL — should NOT return 401 (Vercel SSO)
      const response = await request.post(webhookUrl, {
        headers: {
          'Content-Type': 'application/json',
          'x-github-event': 'ping',
        },
        data: { zen: 'qa-test' },
      })

      // 403 (invalid sig) is correct. 401 (SSO blocked) is the bug.
      expect(response.status()).not.toBe(401)
      // 404 would mean bad projectId, also a bug
      expect(response.status()).not.toBe(404)
    }
  })
```

**Step 3: Run tests**

```bash
cd packages/dashboard
DASHBOARD_URL=https://loop.joincoby.com \
NEXT_PUBLIC_SUPABASE_URL=<from .env.local> \
SUPABASE_SERVICE_ROLE_KEY=<from .env.local> \
npx playwright test onboarding.spec.ts
```

Expected: 5 tests PASS

**Step 4: Commit**

```bash
git add packages/dashboard/tests/e2e/
git commit -m "test(dashboard): add setup checklist and webhook validation E2E tests"
```

---

### Task 6: Write the failure reporter utility

When tests fail, we need to format the failures into a GitHub issue body.

**Files:**
- Create: `packages/dashboard/tests/e2e/helpers/report.ts`

**Step 1: Create the reporter**

Create `packages/dashboard/tests/e2e/helpers/report.ts`:

```ts
import { readFileSync, existsSync } from 'node:fs'

interface TestResult {
  title: string
  status: 'passed' | 'failed' | 'timedOut' | 'skipped'
  error?: { message: string; snippet?: string }
}

interface PlaywrightResults {
  suites: Array<{
    title: string
    specs: Array<{
      title: string
      tests: Array<{
        results: Array<{
          status: string
          error?: { message: string; snippet?: string }
        }>
      }>
    }>
  }>
}

export function parseResults(resultsPath: string): TestResult[] {
  if (!existsSync(resultsPath)) return []
  const raw = JSON.parse(readFileSync(resultsPath, 'utf-8')) as PlaywrightResults
  const results: TestResult[] = []

  for (const suite of raw.suites) {
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        const lastResult = test.results[test.results.length - 1]
        results.push({
          title: spec.title,
          status: lastResult.status as TestResult['status'],
          error: lastResult.error,
        })
      }
    }
  }

  return results
}

export function formatIssueBody(results: TestResult[], workflowUrl: string): string {
  const failures = results.filter((r) => r.status === 'failed' || r.status === 'timedOut')
  const passed = results.filter((r) => r.status === 'passed')

  let body = `## Automated QA: onboarding test failures\n\n`
  body += `**${failures.length} failed**, ${passed.length} passed\n\n`
  body += `[Full workflow run](${workflowUrl})\n\n`
  body += `---\n\n`

  for (const fail of failures) {
    body += `### ❌ ${fail.title}\n\n`
    if (fail.error?.message) {
      const msg = fail.error.message.slice(0, 1000)
      body += `\`\`\`\n${msg}\n\`\`\`\n\n`
    }
  }

  body += `---\n\n`
  body += `> This issue was filed automatically by the QA onboarding bot.\n`
  body += `> Fix the failures, merge to main, and close this issue — the bot will re-test automatically.\n`

  return body
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/tests/e2e/helpers/report.ts
git commit -m "test(dashboard): add Playwright failure reporter for GitHub issue filing"
```

---

### Task 7: Create the GitHub Actions workflow

**Files:**
- Create: `.github/workflows/qa-onboarding.yml`

**Step 1: Create the workflow**

Create `.github/workflows/qa-onboarding.yml`:

```yaml
name: QA Onboarding Loop

on:
  # Manual trigger — start a test run anytime
  workflow_dispatch:

  # Re-run when a qa-onboarding issue is closed (fix deployed)
  issues:
    types: [closed]

  # Re-run after deployment completes (Vercel sends deployment_status)
  deployment_status:

concurrency:
  group: qa-onboarding
  cancel-in-progress: true

jobs:
  test-onboarding:
    # Only run on: manual trigger, qa-onboarding issue closed, or successful deploy
    if: >
      github.event_name == 'workflow_dispatch' ||
      (github.event_name == 'issues' && contains(github.event.issue.labels.*.name, 'qa-onboarding')) ||
      (github.event_name == 'deployment_status' && github.event.deployment_status.state == 'success')
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        working-directory: packages/dashboard
        run: |
          npm ci
          npx playwright install --with-deps chromium

      - name: Wait for deployment to be live
        run: |
          for i in $(seq 1 12); do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ vars.DASHBOARD_URL }}/login")
            if [ "$STATUS" = "200" ]; then
              echo "Dashboard is live"
              exit 0
            fi
            echo "Waiting for dashboard... (attempt $i, status=$STATUS)"
            sleep 10
          done
          echo "Dashboard not reachable after 2 minutes"
          exit 1

      - name: Run onboarding E2E tests
        id: e2e
        continue-on-error: true
        working-directory: packages/dashboard
        env:
          DASHBOARD_URL: ${{ vars.DASHBOARD_URL }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          QA_TEST_EMAIL: ${{ vars.QA_TEST_EMAIL }}
          QA_TEST_PASSWORD: ${{ secrets.QA_TEST_PASSWORD }}
        run: npx playwright test onboarding.spec.ts

      - name: Upload test artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-results
          path: packages/dashboard/test-results/
          retention-days: 7

      - name: File issue on failure
        if: steps.e2e.outcome == 'failure'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Parse results and format issue body
          BODY=$(node -e "
            const { parseResults, formatIssueBody } = require('./packages/dashboard/tests/e2e/helpers/report.js');
            const results = parseResults('./packages/dashboard/test-results/results.json');
            const url = 'https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}';
            console.log(formatIssueBody(results, url));
          " 2>/dev/null || echo "QA onboarding tests failed. See [workflow run](https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}) for details.")

          # Check if an open qa-onboarding issue already exists
          EXISTING=$(gh issue list --label qa-onboarding --state open --json number --jq '.[0].number' 2>/dev/null)

          if [ -n "$EXISTING" ]; then
            echo "Updating existing issue #$EXISTING"
            gh issue comment "$EXISTING" --body "$BODY"
          else
            echo "Creating new issue"
            gh issue create \
              --title "QA: onboarding test failures — $(date +%Y-%m-%d)" \
              --label "feedback-bot,auto-implement,qa-onboarding" \
              --body "$BODY"
          fi

      - name: Comment on success
        if: steps.e2e.outcome == 'success'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          EXISTING=$(gh issue list --label qa-onboarding --state open --json number --jq '.[0].number' 2>/dev/null)
          if [ -n "$EXISTING" ]; then
            gh issue comment "$EXISTING" --body "✅ All onboarding tests passing. Closing."
            gh issue close "$EXISTING"
          fi
```

**Step 2: Commit**

```bash
git add .github/workflows/qa-onboarding.yml
git commit -m "ci: add QA onboarding loop GitHub Action"
```

---

### Task 8: Create the `qa-onboarding` GitHub label

**Step 1: Create label**

```bash
gh label create qa-onboarding --color 5319E7 --description "Filed by the QA onboarding bot" --repo NikitaDmitrieff/feedback-chat --force
```

**Step 2: No commit needed (label is on GitHub, not in code)**

---

### Task 9: Set GitHub Actions secrets and variables

These must be configured in the repo's Settings → Secrets and Variables → Actions.

**Variables** (not secret, used in workflow):

```
DASHBOARD_URL = https://loop.joincoby.com
QA_TEST_EMAIL = qa-bot@feedback.chat
```

**Secrets:**

```
NEXT_PUBLIC_SUPABASE_URL = <from dashboard .env.local>
SUPABASE_SERVICE_ROLE_KEY = <from dashboard .env.local>
QA_TEST_PASSWORD = <choose a password for the QA bot account>
```

**Step 1: Set variables via CLI**

```bash
gh variable set DASHBOARD_URL --body "https://loop.joincoby.com" --repo NikitaDmitrieff/feedback-chat
gh variable set QA_TEST_EMAIL --body "qa-bot@feedback.chat" --repo NikitaDmitrieff/feedback-chat
```

**Step 2: Set secrets via CLI**

```bash
gh secret set NEXT_PUBLIC_SUPABASE_URL --repo NikitaDmitrieff/feedback-chat
gh secret set SUPABASE_SERVICE_ROLE_KEY --repo NikitaDmitrieff/feedback-chat
gh secret set QA_TEST_PASSWORD --repo NikitaDmitrieff/feedback-chat
```

(Each prompts for the value interactively — no secrets in command history.)

**Step 3: No commit needed (secrets are on GitHub)**

---

### Task 10: Run first QA cycle manually

**Step 1: Push all changes to main**

```bash
git push origin main
```

**Step 2: Trigger the workflow**

```bash
gh workflow run qa-onboarding.yml --repo NikitaDmitrieff/feedback-chat
```

**Step 3: Watch the run**

```bash
gh run watch --repo NikitaDmitrieff/feedback-chat
```

**Step 4: Verify behavior**

- If tests pass: no issue filed, workflow exits green
- If tests fail: issue filed with `feedback-bot` + `auto-implement` + `qa-onboarding` labels
- The existing Railway agent picks up the issue (has `feedback-bot` + `auto-implement`)
- Agent creates a PR with the fix
- You merge the PR → Vercel deploys
- You close the issue → workflow re-triggers
- Loop continues until all tests pass

**Step 5: Commit any test adjustments found during the first run**

```bash
git add -A
git commit -m "test(dashboard): adjust E2E tests from first QA run"
```

---

## How the loop works (summary)

```
┌──────────────────────────────────────────────────────┐
│  GitHub Actions: qa-onboarding.yml                   │
│                                                      │
│  Triggers: workflow_dispatch | issue closed |         │
│            deployment_status success                  │
│                                                      │
│  1. Install Playwright + Chromium                    │
│  2. Wait for dashboard to be reachable               │
│  3. Run E2E tests against loop.joincoby.com          │
│  4a. PASS → close existing qa-onboarding issue       │
│  4b. FAIL → file/update GitHub issue                 │
│       (labels: feedback-bot, auto-implement,         │
│        qa-onboarding)                                │
└──────────────┬───────────────────────────────────────┘
               │ issue created
               ▼
┌──────────────────────────────────────────────────────┐
│  Railway Agent (managed-worker)                      │
│                                                      │
│  1. Polls job_queue via claim_next_job RPC           │
│  2. Fetches Claude OAuth creds from credentials      │
│  3. Clones feedback-chat repo                        │
│  4. Runs Claude Code CLI to fix the failing tests    │
│  5. Validates with build + lint                      │
│  6. Creates PR on feedback/issue-N branch            │
└──────────────┬───────────────────────────────────────┘
               │ PR created
               ▼
┌──────────────────────────────────────────────────────┐
│  Human review (you)                                  │
│                                                      │
│  1. Review PR                                        │
│  2. Merge to main                                    │
│  3. Vercel auto-deploys                              │
│  4. Close the qa-onboarding issue                    │
│     → triggers workflow again (loop)                 │
└──────────────────────────────────────────────────────┘
```

**No new infrastructure.** Two new files in your repo (workflow + test). Everything else already exists.
