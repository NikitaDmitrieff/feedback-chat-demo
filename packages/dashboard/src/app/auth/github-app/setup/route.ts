import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // Save installation ID + update setup status
  await supabase
    .from('projects')
    .update({
      github_installation_id: parseInt(installationId, 10),
      setup_status: 'installing',
    })
    .eq('id', state)

  return NextResponse.redirect(new URL(`/projects/${state}?installed=true`, request.url))
}
