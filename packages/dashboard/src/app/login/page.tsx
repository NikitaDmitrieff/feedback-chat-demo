'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Github, ArrowRight, Loader2, Mail, MessageSquareText } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading('email')
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setSent(true)
    setLoading(null)
  }

  async function handleGitHubLogin() {
    setLoading('github')
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-card w-full max-w-sm p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-elevated">
            <Mail className="h-5 w-5 text-muted" />
          </div>
          <h2 className="text-base font-medium text-fg">Check your email</h2>
          <p className="mt-2 text-sm text-muted">
            We sent a login link to{' '}
            <span className="text-fg">{email}</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-card w-full max-w-sm p-8">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-elevated">
            <MessageSquareText className="h-5 w-5 text-muted" />
          </div>
          <h1 className="text-base font-medium text-fg">Feedback Chat</h1>
          <p className="mt-1 text-xs text-muted">Sign in to your dashboard</p>
        </div>

        {/* GitHub OAuth */}
        <button
          onClick={handleGitHubLogin}
          disabled={loading !== null}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-white/90 disabled:opacity-50"
        >
          {loading === 'github' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Github className="h-4 w-4" />
          )}
          Continue with GitHub
        </button>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-edge" />
          <span className="text-[11px] text-muted">or</span>
          <div className="h-px flex-1 bg-edge" />
        </div>

        {/* Magic link */}
        <form onSubmit={handleEmailLogin} className="space-y-3">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input-field"
          />
          <button
            type="submit"
            disabled={loading !== null || !email}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-edge bg-surface text-sm text-fg transition-all hover:border-edge-hover hover:bg-surface-hover disabled:opacity-50"
          >
            {loading === 'email' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Send magic link
                <ArrowRight className="h-3.5 w-3.5 text-muted" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
