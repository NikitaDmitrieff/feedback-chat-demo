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
