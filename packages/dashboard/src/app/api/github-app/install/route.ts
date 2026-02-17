import { NextRequest, NextResponse } from 'next/server'
import { getInstallUrl } from '@/lib/github-app'

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }
  return NextResponse.redirect(getInstallUrl(projectId))
}
