import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { generateApiKey } from '@/lib/api-keys'
import crypto from 'node:crypto'
import { SubmitButton } from './submit-button'

export default function NewProjectPage() {
  async function createProject(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const name = formData.get('name') as string
    const webhookSecret = crypto.randomBytes(32).toString('hex')

    const { data: project, error } = await supabase
      .from('projects')
      .insert({ name, webhook_secret: webhookSecret, user_id: user.id })
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

          <SubmitButton />
        </form>
      </div>
    </div>
  )
}
