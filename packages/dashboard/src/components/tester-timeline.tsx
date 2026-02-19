'use client'

import { MessageCircle, AlertCircle, Play, CheckCircle, XCircle, ThumbsUp } from 'lucide-react'
import { timeAgo } from '@/lib/format'
import { StageBadge } from './stage-badge'
import type { TimelineEvent } from '@/lib/types'

const EVENT_CONFIG: Record<TimelineEvent['type'], { icon: typeof MessageCircle; color: string; label: string }> = {
  conversation_started: { icon: MessageCircle, color: 'text-accent', label: 'Started a conversation' },
  issue_created: { icon: AlertCircle, color: 'text-amber-400', label: 'Feedback became an issue' },
  run_triggered: { icon: Play, color: 'text-blue-400', label: 'Agent started working' },
  run_completed: { icon: CheckCircle, color: 'text-success', label: 'Run completed' },
  feedback_resolved: { icon: ThumbsUp, color: 'text-success', label: 'Conversation resolved' },
}

export function TesterTimeline({
  events,
  projectId,
  githubRepo,
  onSelectSession,
}: {
  events: TimelineEvent[]
  projectId: string
  githubRepo: string | null
  onSelectSession?: (sessionId: string) => void
}) {
  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">No activity yet</p>
    )
  }

  return (
    <div className="space-y-0">
      {events.map((event, i) => {
        const config = EVENT_CONFIG[event.type]
        const Icon = event.type === 'run_completed' && event.result === 'failed' ? XCircle : config.icon
        const color = event.type === 'run_completed' && event.result === 'failed' ? 'text-danger' : config.color

        return (
          <div key={event.id} className="flex items-start gap-3">
            <div className="flex flex-col items-center pt-0.5">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full bg-surface ${color}`}>
                <Icon className="h-3 w-3" />
              </div>
              {i < events.length - 1 && (
                <div className="h-8 w-0.5 bg-edge" />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-fg">{config.label}</span>
                <span className="text-[11px] text-muted">{timeAgo(event.timestamp)}</span>
              </div>

              {event.type === 'conversation_started' && (
                <p className="mt-1 truncate text-xs text-muted">
                  {event.ai_summary || event.message_preview || 'No summary'}
                </p>
              )}

              {event.github_issue_number != null && event.type === 'issue_created' && githubRepo && (
                <a
                  href={`https://github.com/${githubRepo}/issues/${event.github_issue_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex text-xs text-accent hover:underline"
                >
                  Issue #{event.github_issue_number}
                </a>
              )}

              {event.type === 'run_triggered' && event.stage && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-muted">Issue #{event.github_issue_number}</span>
                  <StageBadge stage={event.stage} />
                </div>
              )}

              {event.type === 'run_completed' && (
                <div className="mt-1 flex items-center gap-2">
                  {event.github_pr_number ? (
                    githubRepo ? (
                      <a
                        href={`https://github.com/${githubRepo}/pull/${event.github_pr_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline"
                      >
                        PR #{event.github_pr_number}
                      </a>
                    ) : (
                      <span className="text-xs text-muted">PR #{event.github_pr_number}</span>
                    )
                  ) : (
                    <span className="text-xs text-muted capitalize">{event.result ?? 'unknown'}</span>
                  )}
                </div>
              )}

              {event.session_id && onSelectSession && (
                <button
                  onClick={() => onSelectSession(event.session_id!)}
                  className="mt-1 text-xs text-accent hover:underline"
                >
                  View conversation
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
