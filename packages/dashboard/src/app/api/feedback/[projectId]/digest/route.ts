import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  const url = request.nextUrl
  const period = url.searchParams.get('period') === 'week' ? 'week' : 'day'

  const since = new Date()
  since.setDate(since.getDate() - (period === 'week' ? 7 : 1))

  // Fetch sessions since the period
  const { data: sessions, error: sessionsError } = await supabase
    .from('feedback_sessions')
    .select('*')
    .eq('project_id', projectId)
    .gte('started_at', since.toISOString())
    .order('last_message_at', { ascending: false })

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 })
  }

  // Fetch themes ordered by message_count desc
  const { data: themes, error: themesError } = await supabase
    .from('feedback_themes')
    .select('*')
    .eq('project_id', projectId)
    .order('message_count', { ascending: false })

  if (themesError) {
    return NextResponse.json({ error: themesError.message }, { status: 500 })
  }

  const total = sessions?.length || 0
  const needsAttention = sessions?.filter((s: { status: string }) => s.status === 'open').length || 0
  const resolved = sessions?.filter((s: { status: string }) => s.status === 'resolved').length || 0

  if (total === 0) {
    return NextResponse.json({
      digest: 'No feedback received this period.',
      stats: { total: 0, needsAttention: 0, resolved: 0 },
      topThemes: [],
    })
  }

  const topThemes = (themes || []).slice(0, 5).map((t: { id: string; name: string; message_count: number }) => ({
    id: t.id,
    name: t.name,
    count: t.message_count,
  }))

  const summaries = (sessions || [])
    .filter((s: { ai_summary: string | null }) => s.ai_summary)
    .map((s: { ai_summary: string }) => `- ${s.ai_summary}`)
    .join('\n')

  const themeList = topThemes.map((t: { name: string; count: number }) => `${t.name} (${t.count})`).join(', ')

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
