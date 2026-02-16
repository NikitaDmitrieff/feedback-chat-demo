import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { FeedbackPageClient } from './client'
import type { FeedbackTheme } from '@/lib/types'

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, github_repo')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: themes } = await supabase
    .from('feedback_themes')
    .select('*')
    .eq('project_id', id)
    .order('message_count', { ascending: false })

  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 pb-16">
      <Link
        href={`/projects/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3 w-3" />
        {project.name}
      </Link>

      <h1 className="mb-8 text-lg font-medium text-fg">Feedback</h1>

      <FeedbackPageClient
        projectId={project.id}
        githubRepo={project.github_repo}
        themes={((themes ?? []) as FeedbackTheme[])}
      />
    </div>
  )
}
