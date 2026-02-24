'use client'

import { type FC } from 'react'
import {
  AssistantRuntimeProvider,
  useAui,
  Suggestions,
  AuiIf,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
} from '@assistant-ui/react'
import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { DefaultChatTransport } from 'ai'
import { ArrowUp, Square } from 'lucide-react'
import '@nikitadmitrieff/feedback-chat/styles.css'

function DemoThread() {
  return (
    <ThreadPrimitive.Root className="aui-root aui-thread-root flex h-full flex-col bg-transparent">
      <ThreadPrimitive.Viewport className="relative flex flex-1 flex-col overflow-y-auto scroll-smooth px-4 pt-4">
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <div className="flex w-full grow flex-col items-center justify-center gap-2 px-4 text-center py-8">
            <p className="text-sm font-medium text-foreground">What can we improve?</p>
            <p className="text-xs text-muted-foreground">Ask about feedback-chat or submit an idea.</p>
            <div className="grid w-full gap-2 mt-3 max-w-xs">
              <ThreadPrimitive.Suggestions components={{ Suggestion: DemoSuggestion }} />
            </div>
          </div>
        </AuiIf>

        <ThreadPrimitive.Messages
          components={{ UserMessage: DemoUserMessage, AssistantMessage: DemoAssistantMessage }}
        />

        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto flex w-full flex-col gap-3 overflow-visible pb-3">
          <DemoComposer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

const DemoSuggestion: FC = () => (
  <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
    <SuggestionPrimitive.Trigger send asChild>
      <button className="w-full text-left text-xs px-3 py-2 rounded-xl border border-white/[0.08] text-muted-foreground hover:text-foreground hover:border-white/[0.14] transition-colors">
        <span className="font-medium">
          <SuggestionPrimitive.Title />
        </span>
      </button>
    </SuggestionPrimitive.Trigger>
  </div>
)

const DemoUserMessage: FC = () => (
  <MessagePrimitive.Root
    className="animate-in fade-in slide-in-from-bottom-1 mx-auto flex w-full justify-end py-1 duration-150"
    data-role="user"
  >
    <div className="max-w-[85%] rounded-2xl bg-white/[0.10] px-3 py-2 text-xs text-foreground leading-relaxed">
      <MessagePrimitive.Parts />
    </div>
  </MessagePrimitive.Root>
)

const DemoAssistantMessage: FC = () => (
  <MessagePrimitive.Root
    className="animate-in fade-in slide-in-from-bottom-1 mx-auto w-full py-1 duration-150"
    data-role="assistant"
  >
    <div className="text-xs text-foreground leading-relaxed px-1">
      <MessagePrimitive.Parts />
    </div>
  </MessagePrimitive.Root>
)

const DemoComposer: FC = () => (
  <ComposerPrimitive.Root className="relative flex w-full flex-col">
    <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-1">
      <ComposerPrimitive.Input
        placeholder="Describe your idea..."
        className="flex-1 bg-transparent py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-0 resize-none max-h-24"
        rows={1}
        autoFocus
        aria-label="Message input"
      />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <button
            type="submit"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/15 disabled:opacity-30"
            aria-label="Send message"
          >
            <ArrowUp className="h-3 w-3 text-muted-foreground" />
          </button>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/15"
            aria-label="Stop generating"
          >
            <Square className="h-2.5 w-2.5 fill-current text-muted-foreground" />
          </button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  </ComposerPrimitive.Root>
)

function DemoChatProvider() {
  const runtime = useChatRuntime({
    transport: new DefaultChatTransport({
      api: '/api/demo/chat',
      body: () => ({
        password: 'demo',
        testerName: 'Demo visitor',
      }),
    }),
  })

  const aui = useAui({
    suggestions: Suggestions([
      'How does the feedback widget work?',
      'What is the pipeline feature?',
      'How do I install feedback-chat?',
      'What makes this different from other tools?',
    ]),
  })

  return (
    <AssistantRuntimeProvider runtime={runtime} aui={aui}>
      <div className="feedback-panel" style={{ position: 'relative', height: '100%' }}>
        <div className="feedback-panel-glass flex flex-col h-full overflow-hidden">
          <DemoThread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  )
}

export function DemoWidget() {
  return (
    <div className="w-full" style={{ height: '520px' }}>
      <DemoChatProvider />
    </div>
  )
}
