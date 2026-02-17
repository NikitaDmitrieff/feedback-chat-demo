/**
 * Sandbox repo helpers for pipeline E2E tests.
 *
 * Provides functions to reset the sandbox repo to a known-good state and
 * clean up test artifacts (issues, PRs, branches) between runs.
 *
 * All functions use raw fetch — no `gh` CLI dependency.
 * Expects GITHUB_TOKEN or GH_TOKEN in the environment.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
const API = 'https://api.github.com'
const SANDBOX_REPO = process.env.SANDBOX_REPO || 'NikitaDmitrieff/qa-feedback-sandbox'
const KNOWN_GOOD_SHA = process.env.SANDBOX_KNOWN_GOOD_SHA || ''

function headers(): Record<string, string> {
  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/**
 * Force-update the sandbox repo's main branch to the known-good commit SHA.
 * This effectively reverts any changes made by previous test runs.
 *
 * Requires SANDBOX_KNOWN_GOOD_SHA to be set.
 */
export async function resetSandbox(): Promise<void> {
  if (!KNOWN_GOOD_SHA) {
    throw new Error(
      'resetSandbox: SANDBOX_KNOWN_GOOD_SHA is not set — cannot reset sandbox repo',
    )
  }

  const res = await fetch(`${API}/repos/${SANDBOX_REPO}/git/refs/heads/main`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({
      sha: KNOWN_GOOD_SHA,
      force: true,
    }),
  })

  if (!res.ok) {
    throw new Error(
      `resetSandbox: failed to update main to ${KNOWN_GOOD_SHA}: ${res.status} ${await res.text()}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Artifact cleanup
// ---------------------------------------------------------------------------

/**
 * Close all open issues with the `feedback-bot` label and close all open PRs
 * from `feedback/` branches, then delete those branches.
 */
export async function cleanSandboxArtifacts(): Promise<void> {
  // --- Close all open issues with feedback-bot label ---
  let issuePage = 1
  let hasMoreIssues = true

  while (hasMoreIssues) {
    const res = await fetch(
      `${API}/repos/${SANDBOX_REPO}/issues?state=open&labels=feedback-bot&per_page=100&page=${issuePage}`,
      { headers: headers() },
    )
    if (!res.ok) {
      throw new Error(
        `cleanSandboxArtifacts: failed to list issues: ${res.status} ${await res.text()}`,
      )
    }

    const issues = (await res.json()) as Array<{
      number: number
      pull_request?: unknown
    }>

    if (issues.length === 0) {
      hasMoreIssues = false
      break
    }

    for (const issue of issues) {
      // Skip pull requests — they also appear in the issues endpoint
      if (issue.pull_request) continue

      await fetch(`${API}/repos/${SANDBOX_REPO}/issues/${issue.number}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ state: 'closed' }),
      })
    }

    issuePage++
  }

  // --- Close all open PRs from feedback/ branches and delete those branches ---
  let prPage = 1
  let hasMorePRs = true
  const branchesToDelete: string[] = []

  while (hasMorePRs) {
    const res = await fetch(
      `${API}/repos/${SANDBOX_REPO}/pulls?state=open&per_page=100&page=${prPage}`,
      { headers: headers() },
    )
    if (!res.ok) {
      throw new Error(
        `cleanSandboxArtifacts: failed to list PRs: ${res.status} ${await res.text()}`,
      )
    }

    const pulls = (await res.json()) as Array<{
      number: number
      head: { ref: string }
    }>

    if (pulls.length === 0) {
      hasMorePRs = false
      break
    }

    for (const pr of pulls) {
      if (!pr.head.ref.startsWith('feedback/')) continue

      // Close the PR
      await fetch(`${API}/repos/${SANDBOX_REPO}/pulls/${pr.number}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ state: 'closed' }),
      })

      // Collect branch for deletion (deduplicate)
      if (!branchesToDelete.includes(pr.head.ref)) {
        branchesToDelete.push(pr.head.ref)
      }
    }

    prPage++
  }

  // Delete collected feedback/ branches
  for (const branch of branchesToDelete) {
    await fetch(`${API}/repos/${SANDBOX_REPO}/git/refs/heads/${branch}`, {
      method: 'DELETE',
      headers: headers(),
    })
    // 422 if branch doesn't exist — that's fine
  }
}

// ---------------------------------------------------------------------------
// Combined verification
// ---------------------------------------------------------------------------

/**
 * Full sandbox reset: clean up all test artifacts then force-reset main
 * to the known-good SHA. Call this in test setup (beforeAll / beforeEach).
 */
export async function verifySandboxClean(): Promise<void> {
  await cleanSandboxArtifacts()
  await resetSandbox()
}
