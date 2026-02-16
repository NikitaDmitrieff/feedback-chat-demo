import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { FeedbackSession, FeedbackTheme } from '@/lib/types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  const period = request.nextUrl.searchParams.get('period') === 'week' ? 'week' : 'day'

  const since = new Date()
  since.setDate(since.getDate() - (period === 'week' ? 7 : 1))

  const [sessionsResult, themesResult] = await Promise.all([
    supabase
      .from('feedback_sessions')
      .select('*')
      .eq('project_id', projectId)
      .gte('started_at', since.toISOString())
      .order('last_message_at', { ascending: false }),
    supabase
      .from('feedback_themes')
      .select('*')
      .eq('project_id', projectId)
      .order('message_count', { ascending: false }),
  ])

  if (sessionsResult.error) {
    return NextResponse.json({ error: sessionsResult.error.message }, { status: 500 })
  }
  if (themesResult.error) {
    return NextResponse.json({ error: themesResult.error.message }, { status: 500 })
  }

  const sessions = (sessionsResult.data ?? []) as FeedbackSession[]
  const themes = (themesResult.data ?? []) as FeedbackTheme[]

  const total = sessions.length
  const needsAttention = sessions.filter((s) => s.status === 'open').length
  const resolved = sessions.filter((s) => s.status === 'resolved').length

  if (total === 0) {
    return NextResponse.json({
      digest: 'No feedback received this period.',
      stats: { total: 0, needsAttention: 0, resolved: 0 },
      topThemes: [],
    })
  }

  const topThemes = themes.slice(0, 5).map((t) => ({
    id: t.id,
    name: t.name,
    count: t.message_count,
  }))

  const summaries = sessions
    .filter((s) => s.ai_summary)
    .map((s) => `- ${s.ai_summary}`)
    .join('\n')

  const themeList = topThemes.map((t) => `${t.name} (${t.count})`).join(', ')

  const { text: digest } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    prompt: `You are a feedback analyst for a solo founder. Summarize the feedback received this ${period} in 3-5 actionable sentences.

Stats:
- Total conversations: ${total}
- Needs attention: ${needsAttention}
- Resolved: ${resolved}

Top themes: ${themeList || 'None identified yet'}

Session summaries:
${summaries || 'No AI summaries available yet.'}

Be concise, specific, and actionable. Focus on patterns and priorities.`,
  })

  return NextResponse.json({
    digest,
    stats: { total, needsAttention, resolved },
    topThemes,
  })
}
