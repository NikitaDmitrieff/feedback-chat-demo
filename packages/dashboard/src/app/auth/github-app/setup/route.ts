import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstallationOctokit } from '@/lib/github-app'

export async function GET(request: NextRequest) {
  const installationId = request.nextUrl.searchParams.get('installation_id')
  const state = request.nextUrl.searchParams.get('state') // projectId

  if (!installationId || !state) {
    return NextResponse.redirect(new URL('/projects', request.url))
  }

  const supabase = await createClient()

  // Verify user owns this project
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', state)
    .single()

  if (!project) {
    return NextResponse.redirect(new URL('/projects', request.url))
  }

  // Auto-detect the github_repo from the installation
  let githubRepo = ''
  try {
    const octokit = await getInstallationOctokit(parseInt(installationId, 10))
    const { data } = await octokit.request('GET /installation/repositories', { per_page: 1 })
    if (data.repositories.length > 0) {
      githubRepo = data.repositories[0].full_name
    }
  } catch {
    // Non-fatal: repo will be empty, user can set it later
  }

  // Save installation ID, repo, and update setup status
  await supabase
    .from('projects')
    .update({
      github_installation_id: parseInt(installationId, 10),
      github_repo: githubRepo,
      setup_status: 'installing',
    })
    .eq('id', state)

  return NextResponse.redirect(new URL(`/projects/${state}?installed=true`, request.url))
}
