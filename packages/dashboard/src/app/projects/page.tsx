import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, github_repo, created_at')
    .order('created_at', { ascending: false })

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Projects</h1>
        <Link href="/projects/new">New Project</Link>
      </div>
      {(!projects || projects.length === 0) ? (
        <p>No projects yet. <Link href="/projects/new">Create one</Link>.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {projects.map((p) => (
            <li key={p.id} style={{ padding: '16px 0', borderBottom: '1px solid #eee' }}>
              <Link href={`/projects/${p.id}`}>
                <strong>{p.name}</strong>
                <span style={{ marginLeft: 12, color: '#666' }}>{p.github_repo}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action="/auth/signout" method="post" style={{ marginTop: 40 }}>
        <button type="submit">Sign out</button>
      </form>
    </div>
  )
}
