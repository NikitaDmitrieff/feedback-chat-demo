import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { generateApiKey } from '@/lib/api-keys'
import crypto from 'node:crypto'

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

    // Create project
    const { data: project, error } = await supabase
      .from('projects')
      .insert({ name, github_repo: githubRepo, webhook_secret: webhookSecret, user_id: user.id })
      .select('id')
      .single()

    if (error || !project) throw new Error(error?.message ?? 'Failed to create project')

    // Create API key
    const { raw, hash, prefix } = generateApiKey()
    await supabase.from('api_keys').insert({
      project_id: project.id,
      key_hash: hash,
      prefix,
    })

    // Store credential
    if (credentialValue) {
      await supabase.from('credentials').insert({
        project_id: project.id,
        type: credentialType,
        encrypted_value: credentialValue,  // TODO: encrypt with pgcrypto
      })
    }

    redirect(`/projects/${project.id}?apiKey=${encodeURIComponent(raw)}&webhookSecret=${encodeURIComponent(webhookSecret)}`)
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px' }}>
      <h1>New Project</h1>
      <form action={createProject}>
        <div style={{ marginBottom: 16 }}>
          <label>Project name</label><br />
          <input name="name" required placeholder="My App" style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>GitHub repo (owner/name)</label><br />
          <input name="github_repo" required placeholder="owner/repo" style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Claude credential type</label><br />
          <select name="credential_type" style={{ width: '100%', padding: 8 }}>
            <option value="anthropic_api_key">Anthropic API Key</option>
            <option value="claude_oauth">Claude OAuth (Max subscription)</option>
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Claude credential value</label><br />
          <input name="credential_value" type="password" placeholder="sk-ant-... or JSON" style={{ width: '100%', padding: 8 }} />
        </div>
        <button type="submit" style={{ padding: '12px 24px' }}>Create Project</button>
      </form>
    </div>
  )
}
