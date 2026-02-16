import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { FeedbackMessage, FeedbackTheme } from '@/lib/types'

const THEME_COLORS = [
  '#5e9eff',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  const body = await request.json()
  const { sessionId } = body

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }

  const { data: messages, error: messagesError } = await supabase
    .from('feedback_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 })
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: 'No messages found for session' }, { status: 404 })
  }

  const { data: rawThemes, error: themesError } = await supabase
    .from('feedback_themes')
    .select('*')
    .eq('project_id', projectId)

  if (themesError) {
    return NextResponse.json({ error: themesError.message }, { status: 500 })
  }

  const typedMessages = (messages ?? []) as FeedbackMessage[]
  const existingThemes = (rawThemes ?? []) as FeedbackTheme[]

  const conversationText = typedMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')

  const existingThemeNames = existingThemes.map((t) => t.name)

  const { object: classification } = await generateObject({
    model: anthropic('claude-haiku-4-5-20251001'),
    schema: z.object({
      summary: z.string(),
      themes: z.array(z.string()).min(1).max(3),
    }),
    prompt: `Analyze this feedback conversation and classify it.

${existingThemeNames.length > 0 ? `Existing themes in this project: ${existingThemeNames.join(', ')}. Prefer reusing existing theme names when appropriate.` : ''}

Conversation:
${conversationText}

Return:
- summary: A concise 1-2 sentence summary of the feedback
- themes: 1-3 theme labels (short, lowercase, e.g. "ui bug", "performance", "feature request"). Reuse existing theme names when they fit.`,
  })

  const themeIds: string[] = []

  for (const themeName of classification.themes) {
    const existing = existingThemes.find(
      (t) => t.name.toLowerCase() === themeName.toLowerCase()
    )

    if (existing) {
      await supabase
        .from('feedback_themes')
        .update({
          message_count: existing.message_count + 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      themeIds.push(existing.id)
    } else {
      const usedColors = existingThemes.map((t) => t.color)
      const availableColor =
        THEME_COLORS.find((c) => !usedColors.includes(c)) || THEME_COLORS[themeIds.length % THEME_COLORS.length]

      const { data: newTheme, error: createError } = await supabase
        .from('feedback_themes')
        .insert({
          project_id: projectId,
          name: themeName,
          color: availableColor,
          message_count: 1,
          last_seen_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }

      themeIds.push(newTheme.id)
    }
  }

  const { error: updateError } = await supabase
    .from('feedback_sessions')
    .update({
      ai_summary: classification.summary,
      ai_themes: themeIds,
    })
    .eq('id', sessionId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    summary: classification.summary,
    themes: classification.themes,
    themeIds,
  })
}
