import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FeedbackSession, FeedbackTheme, TimelineEvent, TesterProfile } from '@/lib/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; testerId: string }> }
) {
  const { projectId, testerId } = await params
  const supabase = await createClient()

  const [sessionsResult, themesResult] = await Promise.all([
    supabase
      .from('feedback_sessions')
      .select('*')
      .eq('project_id', projectId)
      .eq('tester_id', testerId)
      .order('started_at', { ascending: false }),
    supabase
      .from('feedback_themes')
      .select('*')
      .eq('project_id', projectId),
  ])

  if (sessionsResult.error) {
    return NextResponse.json({ error: sessionsResult.error.message }, { status: 500 })
  }

  const sessions = sessionsResult.data as FeedbackSession[]
  if (sessions.length === 0) {
    return NextResponse.json({ error: 'Tester not found' }, { status: 404 })
  }

  const themes = (themesResult.data ?? []) as FeedbackTheme[]
  const themeMap = new Map(themes.map(t => [t.id, t]))

  const issueNumbers = sessions
    .filter(s => s.github_issue_number != null)
    .map(s => s.github_issue_number!)

  let runs: { id: string; github_issue_number: number; github_pr_number: number | null; stage: string; started_at: string; completed_at: string | null; result: string | null }[] = []
  if (issueNumbers.length > 0) {
    const { data } = await supabase
      .from('pipeline_runs')
      .select('id, github_issue_number, github_pr_number, stage, started_at, completed_at, result')
      .eq('project_id', projectId)
      .in('github_issue_number', issueNumbers)
      .order('started_at', { ascending: false })
    runs = data ?? []
  }

  const timeline: TimelineEvent[] = []

  for (const session of sessions) {
    timeline.push({
      id: `conv-${session.id}`,
      type: 'conversation_started',
      timestamp: session.started_at,
      session_id: session.id,
      ai_summary: session.ai_summary,
    })

    if (session.github_issue_number != null) {
      timeline.push({
        id: `issue-${session.id}`,
        type: 'issue_created',
        timestamp: session.started_at,
        github_issue_number: session.github_issue_number,
      })
    }

    if (session.status === 'resolved') {
      timeline.push({
        id: `resolved-${session.id}`,
        type: 'feedback_resolved',
        timestamp: session.last_message_at,
        session_id: session.id,
      })
    }
  }

  for (const run of runs) {
    timeline.push({
      id: `run-start-${run.id}`,
      type: 'run_triggered',
      timestamp: run.started_at,
      run_id: run.id,
      github_issue_number: run.github_issue_number,
      stage: run.stage,
    })

    if (run.completed_at) {
      timeline.push({
        id: `run-end-${run.id}`,
        type: 'run_completed',
        timestamp: run.completed_at,
        run_id: run.id,
        github_issue_number: run.github_issue_number,
        github_pr_number: run.github_pr_number,
        stage: run.stage,
        result: run.result,
      })
    }
  }

  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const themeCounts = new Map<string, number>()
  for (const s of sessions) {
    if (s.ai_themes) {
      for (const themeId of s.ai_themes) {
        themeCounts.set(themeId, (themeCounts.get(themeId) || 0) + 1)
      }
    }
  }
  const topThemes = [...themeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => {
      const theme = themeMap.get(id)
      return { name: theme?.name ?? 'Unknown', color: theme?.color ?? '#6366f1', count }
    })

  const profile: TesterProfile = {
    tester_id: testerId,
    tester_name: sessions[0].tester_name,
    first_seen: sessions[sessions.length - 1].started_at,
    last_active: sessions[0].last_message_at,
    session_count: sessions.length,
    resolved_count: sessions.filter(s => s.status === 'resolved').length,
    runs_triggered: runs.length,
    top_themes: topThemes,
    timeline,
    sessions,
  }

  return NextResponse.json({ profile })
}
