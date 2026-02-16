import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FeedbackSession, FeedbackTheme, TesterSummary } from '@/lib/types'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  const [sessionsResult, themesResult] = await Promise.all([
    supabase
      .from('feedback_sessions')
      .select('*')
      .eq('project_id', projectId),
    supabase
      .from('feedback_themes')
      .select('*')
      .eq('project_id', projectId),
  ])

  if (sessionsResult.error) {
    return NextResponse.json({ error: sessionsResult.error.message }, { status: 500 })
  }
  if (themesResult.error) {
    return NextResponse.json({ error: themesResult.error.message }, { status: 500 })
  }

  const sessions = sessionsResult.data as FeedbackSession[]
  const themes = themesResult.data as FeedbackTheme[]
  const themeMap = new Map(themes.map(t => [t.id, t]))

  const grouped = new Map<string, FeedbackSession[]>()
  for (const session of sessions) {
    const key = session.tester_id ?? 'anonymous'
    const group = grouped.get(key)
    if (group) {
      group.push(session)
    } else {
      grouped.set(key, [session])
    }
  }

  const testers: TesterSummary[] = []

  for (const [testerId, testerSessions] of grouped) {
    const lastActive = testerSessions.reduce(
      (max, s) => (s.last_message_at > max ? s.last_message_at : max),
      testerSessions[0].last_message_at
    )

    const themeCounts = new Map<string, number>()
    for (const s of testerSessions) {
      if (s.ai_themes) {
        for (const themeId of s.ai_themes) {
          themeCounts.set(themeId, (themeCounts.get(themeId) || 0) + 1)
        }
      }
    }

    const topThemes = [...themeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => {
        const theme = themeMap.get(id)
        return { name: theme?.name ?? 'Unknown', color: theme?.color ?? '#6366f1', count }
      })

    const resolvedCount = testerSessions.filter(s => s.status === 'resolved').length

    testers.push({
      tester_id: testerId,
      tester_name: testerSessions[0].tester_name,
      session_count: testerSessions.length,
      last_active: lastActive,
      top_themes: topThemes,
      resolved_count: resolvedCount,
      total_count: testerSessions.length,
    })
  }

  testers.sort((a, b) => b.session_count - a.session_count)

  return NextResponse.json({ testers })
}
