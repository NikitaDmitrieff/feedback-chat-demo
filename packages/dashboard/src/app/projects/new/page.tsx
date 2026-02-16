import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { generateApiKey } from '@/lib/api-keys'
import crypto from 'node:crypto'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewProjectPage() {
  async function createProject(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const name = formData.get('name') as string
    const githubRepo = formData.get('github_repo') as string
    const credentialType = formData.get('credential_type') as string
    const credentialValue = formData.get('credential_value') as string

    const webhookSecret = crypto.randomBytes(32).toString('hex')

    const { data: project, error } = await supabase
      .from('projects')
      .insert({ name, github_repo: githubRepo, webhook_secret: webhookSecret, user_id: user.id })
      .select('id')
      .single()

    if (error || !project) throw new Error(error?.message ?? 'Failed to create project')

    const { raw, hash, prefix } = generateApiKey()
    await supabase.from('api_keys').insert({
      project_id: project.id,
      key_hash: hash,
      prefix,
    })

    if (credentialValue) {
      await supabase.from('credentials').insert({
        project_id: project.id,
        type: credentialType,
        encrypted_value: credentialValue,
      })
    }

    redirect(`/projects/${project.id}?apiKey=${encodeURIComponent(raw)}&webhookSecret=${encodeURIComponent(webhookSecret)}`)
  }

  return (
    <div className="mx-auto max-w-lg px-6 pt-10 pb-16">
        <Link
          href="/projects"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to projects
        </Link>

        <div className="glass-card p-6">
          <h1 className="mb-6 text-base font-medium text-fg">New Project</h1>

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
              <label className="text-xs font-medium text-muted">GitHub repo</label>
              <input
                name="github_repo"
                required
                placeholder="owner/repo"
                className="input-field"
              />
              <p className="text-[11px] text-dim">
                The repository where feedback issues will be created
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Claude credential type</label>
              <select name="credential_type" className="input-field">
                <option value="anthropic_api_key">Anthropic API Key</option>
                <option value="claude_oauth">Claude OAuth (Max subscription)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Claude credential value</label>
              <input
                name="credential_value"
                type="password"
                placeholder="sk-ant-... or OAuth JSON"
                className="input-field"
              />
              <p className="text-[11px] text-dim">
                Used by the agent to run Claude Code on your behalf
              </p>
            </div>

            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center rounded-xl bg-white text-sm font-medium text-bg transition-colors hover:bg-white/90"
            >
              Create Project
            </button>
          </form>
        </div>
    </div>
  )
}
