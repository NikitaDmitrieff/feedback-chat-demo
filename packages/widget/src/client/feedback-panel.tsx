'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { DefaultChatTransport } from 'ai'
import { AssistantRuntimeProvider, useThreadRuntime, useAui, Suggestions } from '@assistant-ui/react'
import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { ArrowUp, PanelRight, X, AlertCircle, ArrowRight, Loader2, Lightbulb } from 'lucide-react'
import { Thread } from './thread'
import { useConversations } from './use-conversations'
import { ConversationTabs } from './conversation-tabs'
import { PresentOptionsToolUI } from './present-options-tool-ui'
import { SubmitRequestToolUI } from './submit-request-tool-ui'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip'
import type { FeedbackPanelProps } from './types'

const STORAGE_KEY = 'feedback_password'
const NAME_KEY = 'feedback_tester_name'

export function FeedbackPanel({ isOpen, onToggle, apiUrl = '/api/feedback/chat' }: FeedbackPanelProps & { apiUrl?: string }) {
  const [authenticated, setAuthenticated] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) !== null
  )
  const [testerName, setTesterName] = useState(
    () => typeof window !== 'undefined' ? localStorage.getItem(NAME_KEY) : null
  )
  const [pendingMessage, setPendingMessage] = useState('')
  const [triggerInput, setTriggerInput] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const [pipelineActive, setPipelineActive] = useState(false)

  // Listen for pipeline status changes
  useEffect(() => {
    function check() {
      setPipelineActive(localStorage.getItem('feedback_active_pipeline') !== null)
    }
    check()
    window.addEventListener('pipeline-status', check)
    window.addEventListener('storage', check)
    return () => {
      window.removeEventListener('pipeline-status', check)
      window.removeEventListener('storage', check)
    }
  }, [])

  // Click outside panel to close
  useEffect(() => {
    if (!isOpen) return

    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onToggle()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen, onToggle])

  // Keyboard shortcuts: Cmd/Ctrl+Shift+F to toggle, Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        onToggle()
      } else if (e.key === 'Escape' && isOpen) {
        onToggle()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onToggle, isOpen])

  function handleTriggerSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!triggerInput.trim()) return
    setPendingMessage(triggerInput.trim())
    setTriggerInput('')
    if (!isOpen) onToggle()
  }

  const clearPendingMessage = useCallback(() => {
    setPendingMessage('')
  }, [])

  return (
    <TooltipProvider>
      {/* Centered composer bar — real input, opens panel on Enter */}
      <div
        className={`feedback-trigger-bar fixed bottom-6 left-1/2 z-50 w-full -translate-x-1/2 transition-all duration-300 ${
          isOpen
            ? 'pointer-events-none translate-y-4 opacity-0'
            : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <form
            onSubmit={handleTriggerSubmit}
            className="feedback-trigger-input flex flex-1 items-center gap-3 rounded-2xl px-5 py-1"
          >
            <input
              type="text"
              value={triggerInput}
              onChange={(e) => setTriggerInput(e.target.value)}
              placeholder="Share an idea..."
              className="flex-1 bg-transparent py-3 text-sm text-[#e8eaed] outline-none placeholder:text-[#8b8d93]"
              aria-label="Share an idea"
            />
            <button
              type="submit"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/15"
              aria-label="Send"
            >
              <ArrowUp className="h-3.5 w-3.5 text-[#8b8d93]" />
            </button>
          </form>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggle}
                className="feedback-trigger-button flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl"
                aria-label="Open feedback (⌘⇧F)"
              >
                <PanelRight className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Open feedback (⌘⇧F)</TooltipContent>
          </Tooltip>
          {pipelineActive && (
            <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center" title="Pipeline running">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        ref={panelRef}
        className={`feedback-panel fixed right-0 top-0 z-50 h-full p-3 transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full w-[400px] flex-col text-foreground">
          {authenticated && testerName ? (
            <ChatContent
              isOpen={isOpen}
              onClose={onToggle}
              pendingMessage={pendingMessage}
              onPendingMessageSent={clearPendingMessage}
              apiUrl={apiUrl}
              testerName={testerName}
            />
          ) : authenticated && !testerName ? (
            <div className="feedback-panel-glass flex h-full flex-col overflow-hidden">
              <NameGate onName={setTesterName} onClose={onToggle} />
            </div>
          ) : (
            <div className="feedback-panel-glass flex h-full flex-col overflow-hidden">
              <PasswordGate onAuth={() => setAuthenticated(true)} onClose={onToggle} apiUrl={apiUrl} />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

function ChatContent({
  isOpen,
  onClose,
  pendingMessage,
  onPendingMessageSent,
  apiUrl,
  testerName,
}: {
  isOpen: boolean
  onClose: () => void
  pendingMessage: string
  onPendingMessageSent: () => void
  apiUrl: string
  testerName: string
}) {
  const runtime = useChatRuntime({
    transport: new DefaultChatTransport({
      api: apiUrl,
      body: () => ({
        password: sessionStorage.getItem(STORAGE_KEY) || '',
        testerName,
      }),
    }),
  })

  const aui = useAui({
    suggestions: Suggestions([
      "The checkout flow is confusing",
      "I'd love dark mode",
      "The search results are irrelevant",
      "Can you add keyboard shortcuts?",
    ]),
  })

  return (
    <AssistantRuntimeProvider runtime={runtime} aui={aui}>
      <ConversationManager
        isOpen={isOpen}
        onClose={onClose}
        pendingMessage={pendingMessage}
        onPendingMessageSent={onPendingMessageSent}
      />
      <PresentOptionsToolUI />
      <SubmitRequestToolUI />
    </AssistantRuntimeProvider>
  )
}

function ConversationManager({
  isOpen,
  onClose,
  pendingMessage,
  onPendingMessageSent,
}: {
  isOpen: boolean
  onClose: () => void
  pendingMessage: string
  onPendingMessageSent: () => void
}) {
  const { conversations, activeId, switchTo, create, remove, save } = useConversations()
  const threadRuntime = useThreadRuntime()
  const onSentRef = useRef(onPendingMessageSent)
  onSentRef.current = onPendingMessageSent

  // Save when panel closes
  const prevOpenRef = useRef(isOpen)
  useEffect(() => {
    if (prevOpenRef.current && !isOpen) {
      save()
    }
    prevOpenRef.current = isOpen
  }, [isOpen, save])

  // Create a NEW conversation + send the pending message
  useEffect(() => {
    if (!pendingMessage || !activeId) return

    // Start a fresh conversation for this message
    create()

    // Wait for create() + reset() to settle, then send
    const timer = setTimeout(() => {
      try {
        threadRuntime.composer.setText(pendingMessage)
      } catch {
        return
      }

      requestAnimationFrame(() => {
        try {
          threadRuntime.composer.send()
        } catch {
          // send failed
        }
        onSentRef.current()
      })
    }, 600)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fire when pendingMessage changes
  }, [pendingMessage])

  return (
    <div className="flex h-full flex-col gap-2">
      <ConversationTabs
        conversations={conversations}
        activeId={activeId}
        onSwitch={switchTo}
        onCreate={create}
        onRemove={remove}
        onClose={onClose}
      />
      <div className="feedback-panel-glass flex flex-1 flex-col overflow-hidden">
        <Thread />
      </div>
    </div>
  )
}

function PasswordGate({ onAuth, onClose, apiUrl }: { onAuth: () => void; onClose: () => void; apiUrl: string }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [], password }),
      })

      if (res.status === 401) {
        setError('Incorrect password.')
        return
      }

      sessionStorage.setItem(STORAGE_KEY, password)
      onAuth()
    } catch {
      setError('Connection error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-8">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <p className="mb-5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(139,141,147,0.5)' }}>
        feedback
      </p>

      <div className="feedback-gate-orb mb-5">
        <Lightbulb className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.65)' }} />
      </div>

      <h2 className="mb-1 text-[15px] font-semibold text-foreground">Welcome.</h2>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        Share your ideas and help us improve.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 flex w-full items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <input
          type="password"
          autoComplete="off"
          placeholder="Password"
          aria-label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !password}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Access
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </form>
    </div>
  )
}

function NameGate({ onName, onClose }: { onName: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    localStorage.setItem(NAME_KEY, trimmed)
    onName(trimmed)
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-8">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <p className="mb-5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(139,141,147,0.5)' }}>
        feedback
      </p>

      <div className="feedback-gate-orb mb-5">
        <Lightbulb className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.65)' }} />
      </div>

      <h2 className="mb-1 text-[15px] font-semibold text-foreground">What should we call you?</h2>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        We'll use your name to identify your feedback.
      </p>

      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <input
          type="text"
          autoComplete="name"
          placeholder="Your name"
          aria-label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Continue
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  )
}
