import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  const { runId } = await params
  const supabase = await createClient()

  const { data: logs, error } = await supabase
    .from('run_logs')
    .select('id, timestamp, level, message')
    .eq('run_id', runId)
    .order('timestamp', { ascending: true })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs })
}
