import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FeedbackSource } from '@/lib/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createClient()

  const [runsResult, sessionsResult] = await Promise.all([
    supabase
      .from('pipeline_runs')
      .select('id, github_issue_number, github_pr_number, stage, triggered_by, started_at, completed_at, result')
      .eq('project_id', projectId)
      .order('started_at', { ascending: false })
      .limit(50),
    supabase
      .from('feedback_sessions')
      .select('id, github_issue_number, tester_name, ai_summary, ai_themes')
      .eq('project_id', projectId)
      .not('github_issue_number', 'is', null),
  ])

  if (runsResult.error) {
    return NextResponse.json({ error: runsResult.error.message }, { status: 500 })
  }

  const feedbackByIssue = new Map<number, FeedbackSource>()
  if (sessionsResult.data) {
    for (const s of sessionsResult.data) {
      if (s.github_issue_number != null) {
        feedbackByIssue.set(s.github_issue_number, {
          session_id: s.id,
          tester_name: s.tester_name,
          ai_summary: s.ai_summary,
          ai_themes: s.ai_themes,
        })
      }
    }
  }

  const runs = runsResult.data.map((run) => ({
    ...run,
    feedback_source: feedbackByIssue.get(run.github_issue_number) ?? null,
  }))

  return NextResponse.json({ runs })
}
