import Link from 'next/link'
import { MessageSquareText } from 'lucide-react'

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 border-b border-edge bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link
          href="/projects"
          className="flex items-center gap-2.5 text-sm font-medium text-fg transition-colors hover:text-white"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-elevated">
            <MessageSquareText className="h-3.5 w-3.5 text-muted" />
          </div>
          Feedback Chat
        </Link>

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  )
}
