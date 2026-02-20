import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGitHubApp } from '@/lib/github-app'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Get project + installation
  const { data: project, error: fetchErr } = await supabase
    .from('projects')
    .select('github_repo, github_installation_id')
    .eq('id', id)
    .single()

  if (fetchErr || !project?.github_repo || !project?.github_installation_id) {
    return NextResponse.json(
      { error: 'Project not found or no GitHub repo configured' },
      { status: 400 }
    )
  }

  const [owner, repo] = project.github_repo.split('/')
  if (!owner || !repo) {
    return NextResponse.json({ error: 'Invalid github_repo format' }, { status: 400 })
  }

  // 2. Get installation octokit
  const app = getGitHubApp()
  const octokit = await app.getInstallationOctokit(project.github_installation_id)

  // 3. Fetch repo data in parallel
  const [readmeRes, pkgRes, issuesRes, repoRes] = await Promise.allSettled([
    octokit.request('GET /repos/{owner}/{repo}/readme', { owner, repo, mediaType: { format: 'raw' } }),
    octokit.request('GET /repos/{owner}/{repo}/contents/package.json', { owner, repo, mediaType: { format: 'raw' } }),
    octokit.request('GET /repos/{owner}/{repo}/issues', { owner, repo, per_page: 20, state: 'all', sort: 'created', direction: 'desc' }),
    octokit.request('GET /repos/{owner}/{repo}', { owner, repo }),
  ])

  const readme = readmeRes.status === 'fulfilled' ? String(readmeRes.value.data).slice(0, 3000) : ''
  const pkgJson = pkgRes.status === 'fulfilled' ? String(pkgRes.value.data).slice(0, 1000) : ''
  const issues = issuesRes.status === 'fulfilled'
    ? (issuesRes.value.data as Array<{ title: string }>).map(i => `- ${i.title}`).join('\n')
    : ''
  const description = repoRes.status === 'fulfilled'
    ? (repoRes.value.data as { description: string | null }).description || ''
    : ''

  // 4. Generate summary with Haiku
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Summarize this GitHub repository in 2-3 paragraphs. Cover: what the product is, who it's for, the tech stack, and current development priorities based on recent issues.

Repository: ${owner}/${repo}
${description ? `Description: ${description}` : ''}

README (first 3000 chars):
${readme || 'No README found.'}

package.json (partial):
${pkgJson || 'Not found.'}

Recent issues:
${issues || 'No issues found.'}

Write in third person, present tense. Be concise and factual.`,
    }],
  })

  const summary = response.content[0].type === 'text' ? response.content[0].text : ''

  // 5. Save to project
  const { error: updateErr } = await supabase
    .from('projects')
    .update({ product_context: summary })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ product_context: summary })
}
