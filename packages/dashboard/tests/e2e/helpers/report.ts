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
