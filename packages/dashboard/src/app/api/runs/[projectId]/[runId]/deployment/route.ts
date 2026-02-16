import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  const { projectId, runId } = await params
  const supabase = await createClient()

  // Get the run's PR number
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('github_pr_number')
    .eq('id', runId)
    .eq('project_id', projectId)
    .single()

  if (!run?.github_pr_number) {
    return NextResponse.json({ state: null, previewUrl: null, description: null })
  }

  // Get the project's GitHub repo
  const { data: project } = await supabase
    .from('projects')
    .select('github_repo')
    .eq('id', projectId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const [owner, repo] = project.github_repo.split('/')

  // Fetch PR to get head SHA
  // Note: We use the user's GitHub token from credentials, or fall back to env
  const { data: cred } = await supabase
    .from('credentials')
    .select('encrypted_value')
    .eq('project_id', projectId)
    .limit(1)
    .single()

  // For now, use GITHUB_TOKEN from env as fallback
  const githubToken = process.env.GITHUB_TOKEN
  if (!githubToken) {
    return NextResponse.json({ state: null, previewUrl: null, description: 'No GitHub token configured' })
  }

  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github.v3+json',
  }

  // Get PR head SHA
  const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${run.github_pr_number}`, { headers })
  if (!prRes.ok) {
    return NextResponse.json({ state: null, previewUrl: null, description: 'Failed to fetch PR' })
  }
  const prData = await prRes.json()
  const sha = prData.head?.sha

  if (!sha) {
    return NextResponse.json({ state: null, previewUrl: null, description: 'No head commit' })
  }

  // Get commit statuses
  const statusRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/statuses`, { headers })
  if (!statusRes.ok) {
    return NextResponse.json({ state: null, previewUrl: null, description: 'Failed to fetch statuses' })
  }
  const statuses: Array<{ state: string; target_url: string; description: string; context: string }> = await statusRes.json()

  // Find Vercel deployment status
  const vercelStatus = statuses.find((s) => s.context.toLowerCase().includes('vercel'))

  if (!vercelStatus) {
    return NextResponse.json({ state: null, previewUrl: null, description: 'No Vercel deployment found' })
  }

  return NextResponse.json({
    state: vercelStatus.state,
    previewUrl: vercelStatus.target_url,
    description: vercelStatus.description,
  })
}
