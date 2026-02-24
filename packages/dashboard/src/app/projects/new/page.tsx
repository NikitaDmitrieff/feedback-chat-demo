import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { generateApiKey } from '@/lib/api-keys'
import crypto from 'node:crypto'
import { MessageSquare, GitBranch, Zap, CheckCircle2 } from 'lucide-react'
import { SubmitButton } from './submit-button'

export default function NewProjectPage() {
  async function createProject(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const name = formData.get('name') as string
    const githubRepo = formData.get('github_repo') as string | null
    const webhookSecret = crypto.randomBytes(32).toString('hex')

    const { data: project, error } = await supabase
      .from('projects')
      .insert({ name, github_repo: githubRepo || null, webhook_secret: webhookSecret, user_id: user.id })
      .select('id')
      .single()

    if (error || !project) throw new Error(error?.message ?? 'Failed to create project')

    const { raw, hash, prefix } = generateApiKey()
    await supabase.from('api_keys').insert({
      project_id: project.id,
      key_hash: hash,
      prefix,
    })

    redirect(`/projects/${project.id}?apiKey=${encodeURIComponent(raw)}&webhookSecret=${encodeURIComponent(webhookSecret)}`)
  }

  return (
    <div className="mx-auto max-w-lg px-6 pt-10 pb-16">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center justify-center rounded-2xl bg-accent/10 p-3 ring-1 ring-accent/20 shadow-[0_0_24px_rgba(94,158,255,0.15)]">
          <MessageSquare className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-xl font-semibold text-fg">Set up a new project</h1>
        <p className="mt-2 text-sm text-muted">
          Connect your app to start receiving and acting on user feedback
        </p>
      </div>

      <div className="glass-card p-6">
        <form action={createProject} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted">Project name</label>
            <input
              name="name"
              required
              placeholder="My App"
              className="input-field"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted">
              GitHub repository
              <span className="ml-1.5 text-[10px] font-normal text-muted/60">(optional)</span>
            </label>
            <input
              name="github_repo"
              placeholder="owner/repo"
              className="input-field"
            />
            <p className="text-[11px] text-muted/50">Required for the full pipeline</p>
          </div>

          <SubmitButton />
        </form>

        {/* 3-step flow */}
        <div className="mt-6 pt-5 border-t border-white/[0.06]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 ring-1 ring-accent/20">
                <MessageSquare className="h-3.5 w-3.5 text-accent" />
              </div>
              <span className="text-[11px] font-medium text-muted/70">Connect widget</span>
            </div>
            <div className="flex-shrink-0 text-muted/30 text-xs">→</div>
            <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 ring-1 ring-accent/20">
                <GitBranch className="h-3.5 w-3.5 text-accent" />
              </div>
              <span className="text-[11px] font-medium text-muted/70">Collect feedback</span>
            </div>
            <div className="flex-shrink-0 text-muted/30 text-xs">→</div>
            <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 ring-1 ring-accent/20">
                <Zap className="h-3.5 w-3.5 text-accent" />
              </div>
              <span className="text-[11px] font-medium text-muted/70">Ship features</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
