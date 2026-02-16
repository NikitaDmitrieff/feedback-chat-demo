'use server'

import { createClient } from '@/lib/supabase/server'

export async function markAllStepsDone(projectId: string) {
  const supabase = await createClient()

  await supabase
    .from('projects')
    .update({
      setup_progress: {
        install: true,
        env_vars: true,
        webhook: true,
        labels: true,
      },
    })
    .eq('id', projectId)
}

export async function markStepDone(projectId: string, stepKey: string) {
  const supabase = await createClient()

  // Read current progress
  const { data: project } = await supabase
    .from('projects')
    .select('setup_progress')
    .eq('id', projectId)
    .single()

  if (!project) throw new Error('Project not found')

  const progress = (project.setup_progress as Record<string, boolean>) ?? {}
  progress[stepKey] = true

  await supabase
    .from('projects')
    .update({ setup_progress: progress })
    .eq('id', projectId)
}
