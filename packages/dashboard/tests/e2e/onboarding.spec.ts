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
})
