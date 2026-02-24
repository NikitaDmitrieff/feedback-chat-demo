import Link from 'next/link'
import { MessageSquare, Github, Zap, Terminal, ArrowRight, Check } from 'lucide-react'
import { DemoWidget } from '@/components/demo-widget'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-4 backdrop-blur-sm border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-[rgba(94,158,255,0.15)] flex items-center justify-center">
            <MessageSquare className="h-3 w-3 text-[#5e9eff]" />
          </div>
          <span className="text-sm font-semibold text-[var(--color-fg)]">feedback.chat</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/NikitaDmitrieff/feedback-chat"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
          >
            GitHub
          </a>
          <Link
            href="/projects"
            className="btn-primary rounded-xl px-4 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
          >
            Dashboard
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 pt-40 pb-24">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(94,158,255,0.10)] border border-[rgba(94,158,255,0.20)] text-xs text-[#5e9eff] mb-8 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5e9eff] animate-pulse" />
          Feedback → Issue → PR. Automatic.
        </div>
        <h1 className="text-[2.5rem] md:text-[3.25rem] font-semibold text-[var(--color-fg)] tracking-tight max-w-2xl leading-[1.1]">
          Turn user feedback into shipped features — automatically
        </h1>
        <p className="mt-6 text-base text-[var(--color-muted)] max-w-xl leading-relaxed">
          AI refines ideas into GitHub issues. Your agent implements them. You approve the PR.
        </p>
        <div className="mt-10 flex items-center gap-3 flex-wrap justify-center">
          <Link
            href="/projects"
            className="btn-primary rounded-xl px-7 py-3 text-sm font-medium inline-flex items-center gap-2"
          >
            Open Dashboard
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <a
            href="https://github.com/NikitaDmitrieff/feedback-chat"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl px-7 py-3 text-sm font-medium border border-white/[0.08] text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:border-white/[0.14] transition-colors inline-flex items-center gap-2"
          >
            <Github className="h-4 w-4" />
            View on GitHub
          </a>
        </div>
      </section>

      {/* Live demo */}
      <section className="px-6 pb-20 max-w-4xl mx-auto w-full">
        <p className="text-center text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider mb-4">
          Try it now
        </p>
        <h2 className="text-center text-xl font-semibold text-[var(--color-fg)] mb-2">
          Chat with the AI advisor
        </h2>
        <p className="text-center text-sm text-[var(--color-muted)] mb-10 max-w-lg mx-auto">
          This is exactly what your users will see. Ask anything about feedback-chat or submit a feature idea.
        </p>
        <div className="flex flex-col md:flex-row items-start gap-10">
          <div className="flex-1 space-y-6">
            <div className="glass-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-8 w-8 rounded-lg bg-[rgba(94,158,255,0.10)] flex items-center justify-center shrink-0">
                  <MessageSquare className="h-4 w-4 text-[#5e9eff]" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--color-fg)]">Embedded widget</div>
                  <div className="text-xs text-[var(--color-muted)]">Floats in your app, no page navigation</div>
                </div>
              </div>
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                Drop it into any Next.js app in minutes. Your users can share ideas without leaving the page.
              </p>
            </div>
            <div className="glass-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-8 w-8 rounded-lg bg-[rgba(34,197,94,0.10)] flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 text-[#22c55e]" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--color-fg)]">AI-guided conversations</div>
                  <div className="text-xs text-[var(--color-muted)]">Turns vague ideas into actionable specs</div>
                </div>
              </div>
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                The advisor asks the right questions, then generates a precise prompt for your AI agent.
              </p>
            </div>
          </div>
          <div className="w-full md:w-[400px] shrink-0">
            <DemoWidget />
          </div>
        </div>
      </section>

      {/* Flow visualization */}
      <section className="px-6 pb-20 max-w-4xl mx-auto w-full">
        <p className="text-center text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider mb-10">
          How it works
        </p>
        <div className="flex flex-col md:flex-row items-stretch gap-3 md:gap-0">
          {/* Step 1 */}
          <div className="glass-card flex-1 flex flex-col items-center gap-4 px-6 py-8">
            <div className="h-11 w-11 rounded-xl bg-[rgba(94,158,255,0.10)] flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-[#5e9eff]" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-[var(--color-fg)]">Chat</div>
              <div className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                User submits feedback via widget
              </div>
            </div>
            <span className="text-[10px] font-mono text-[var(--color-muted)] opacity-50 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded-full">
              Step 1
            </span>
          </div>

          {/* Connector */}
          <div
            aria-hidden="true"
            className="hidden md:flex self-center flex-none relative w-12 h-6 items-center"
          >
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[rgba(94,158,255,0.20)]" />
            <div className="flow-dot" />
            <div className="flow-dot" />
            <div className="flow-dot" />
          </div>

          {/* Step 2 */}
          <div className="glass-card flex-1 flex flex-col items-center gap-4 px-6 py-8">
            <div className="h-11 w-11 rounded-xl bg-[rgba(94,158,255,0.10)] flex items-center justify-center">
              <Github className="h-5 w-5 text-[#5e9eff]" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-[var(--color-fg)]">GitHub Issue</div>
              <div className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                AI creates a structured issue
              </div>
            </div>
            <span className="text-[10px] font-mono text-[var(--color-muted)] opacity-50 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded-full">
              Step 2
            </span>
          </div>

          {/* Connector */}
          <div
            aria-hidden="true"
            className="hidden md:flex self-center flex-none relative w-12 h-6 items-center"
          >
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[rgba(94,158,255,0.20)]" />
            <div className="flow-dot" />
            <div className="flow-dot" />
            <div className="flow-dot" />
          </div>

          {/* Step 3 */}
          <div className="glass-card flex-1 flex flex-col items-center gap-4 px-6 py-8">
            <div className="h-11 w-11 rounded-xl bg-[rgba(34,197,94,0.10)] flex items-center justify-center">
              <Zap className="h-5 w-5 text-[#22c55e]" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-[var(--color-fg)]">Agent implements</div>
              <div className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Claude runs, creates PR, you approve
              </div>
            </div>
            <span className="text-[10px] font-mono text-[var(--color-muted)] opacity-50 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded-full">
              Step 3
            </span>
          </div>
        </div>
      </section>

      {/* 3-tier grid */}
      <section className="px-6 pb-20 max-w-4xl mx-auto w-full">
        <p className="text-center text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider mb-10">
          Choose your tier
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Chat Only */}
          <div className="glass-card p-6 flex flex-col gap-4">
            <div className="h-9 w-9 rounded-lg bg-white/[0.06] flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-[var(--color-muted)]" />
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--color-fg)]">Chat only</div>
              <div className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                AI conversations with localStorage persistence. No backend setup required.
              </div>
            </div>
            <ul className="space-y-2 mt-auto pt-2">
              {['AI feedback advisor', 'Conversation history', 'Password protected'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  <Check className="h-3 w-3 text-[var(--color-muted)] opacity-50 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* +GitHub */}
          <div className="glass-card p-6 flex flex-col gap-4 border-[rgba(94,158,255,0.20)]">
            <div className="h-9 w-9 rounded-lg bg-[rgba(94,158,255,0.10)] flex items-center justify-center">
              <Github className="h-4 w-4 text-[#5e9eff]" />
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--color-fg)]">+ GitHub</div>
              <div className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Chat plus AI auto-creates structured GitHub issues from feedback.
              </div>
            </div>
            <ul className="space-y-2 mt-auto pt-2">
              {['Everything in Chat', 'Auto GitHub issues', 'Structured specs'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  <Check className="h-3 w-3 text-[#5e9eff] opacity-70 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* +Pipeline */}
          <div className="glass-card p-6 flex flex-col gap-4">
            <div className="h-9 w-9 rounded-lg bg-[rgba(34,197,94,0.10)] flex items-center justify-center">
              <Zap className="h-4 w-4 text-[#22c55e]" />
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--color-fg)]">+ Pipeline</div>
              <div className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Full automation: agent writes code, deploys preview, you approve.
              </div>
            </div>
            <ul className="space-y-2 mt-auto pt-2">
              {['Everything in +GitHub', 'Agent writes code', 'Preview → Approve'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  <Check className="h-3 w-3 text-[#22c55e] opacity-70 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Install snippet */}
      <section className="px-6 pb-28 max-w-4xl mx-auto w-full">
        <p className="text-center text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider mb-10">
          Get started in minutes
        </p>
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="h-4 w-4 text-[var(--color-muted)]" />
            <span className="text-xs text-[var(--color-muted)]">Install</span>
          </div>
          <div className="code-block">
            npm install @nikitadmitrieff/feedback-chat
          </div>
          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <span className="text-xs text-[var(--color-muted)]">
              Then wrap your app in minutes. See docs for full setup steps.
            </span>
            <Link
              href="/projects"
              className="text-xs text-[#5e9eff] hover:opacity-80 transition-opacity inline-flex items-center gap-1"
            >
              Start building
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-8 px-6 mt-auto">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-[var(--color-muted)]">
          <span>feedback.chat</span>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/NikitaDmitrieff/feedback-chat"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--color-fg)] transition-colors"
            >
              GitHub
            </a>
            <Link href="/projects" className="hover:text-[var(--color-fg)] transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
