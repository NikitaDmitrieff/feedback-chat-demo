import { test, expect } from '@playwright/test'
import { signIn, createTestProject } from './helpers/auth'

const EMAIL = process.env.QA_TEST_EMAIL || 'qa-bot@feedback.chat'
const PASSWORD = process.env.QA_TEST_PASSWORD || 'qa-test-password-2026'

test.describe('Onboarding flow', () => {
  test('Step 1: can sign in to the dashboard', async ({ page }) => {
    await page.goto('/login')

    // Wait for the client-side page to hydrate (dynamic import with ssr: false)
    await expect(page.getByRole('heading', { name: 'Feedback Chat' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

    // Fill credentials
    await page.fill('[placeholder="Email address"]', EMAIL)
    await page.fill('[placeholder="Password"]', PASSWORD)

    // Wait for button to be enabled (disabled until fields are filled)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Should redirect to /projects (uses window.location.href, full page load)
    await page.waitForURL('**/projects', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  })

  test('Step 2: can create a new project', async ({ page }) => {
    const { projectName } = await createTestProject(page)

    // Should see the project name on the detail page
    await expect(page.locator(`text=${projectName}`)).toBeVisible()

    // Should see setup checklist header (use exact match — page has
    // "Setup", "Setup with Claude Code", and potentially "Setup complete")
    await expect(page.getByText('Setup', { exact: true }).first()).toBeVisible()
  })

  test('Step 3: setup checklist renders with correct steps', async ({ page }) => {
    await createTestProject(page)

    // Verify all 5 checklist step titles are visible (use .first() since
    // expanded step content may duplicate the title text)
    await expect(page.getByText('Install the widget').first()).toBeVisible()
    await expect(page.getByText('Add environment variables').first()).toBeVisible()
    await expect(page.getByText('Configure GitHub webhook').first()).toBeVisible()
    await expect(page.getByText('Create GitHub labels').first()).toBeVisible()
    await expect(page.getByText('Send your first feedback').first()).toBeVisible()
  })

  test('Step 4: Claude prompt uses production URL (not localhost)', async ({ page }) => {
    await createTestProject(page)

    // Expand the Claude Code quick setup section
    await page.getByText('Setup with Claude Code').click()

    // Read the generated prompt from the <pre> block
    const promptArea = page.locator('pre').first()
    await expect(promptArea).toBeVisible({ timeout: 5_000 })
    const promptText = await promptArea.textContent()

    // Must NOT contain localhost
    expect(promptText).not.toContain('localhost')

    // Must use https (production URL, not http://localhost)
    expect(promptText).toContain('https://')

    // Must contain --save in install command
    expect(promptText).toContain('--save')

    // Must reference FEEDBACK_PASSWORD (not FEEDBACK_CHAT_API_KEY)
    expect(promptText).toContain('FEEDBACK_PASSWORD')
  })

  test('Step 5: webhook URL is reachable (no 401)', async ({ page, request }) => {
    await createTestProject(page)

    // Extract project ID from the current URL
    const projectId = page.url().match(/\/projects\/([a-f0-9-]+)/)?.[1]
    expect(projectId).toBeTruthy()

    // Construct webhook URL from the dashboard base URL
    const dashboardUrl = process.env.DASHBOARD_URL || 'https://loop.joincoby.com'
    const webhookUrl = `${dashboardUrl}/api/webhook/${projectId}`

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
  })
})
