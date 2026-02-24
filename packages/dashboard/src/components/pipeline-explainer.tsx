const STAGES = [
  { icon: '💬', label: 'Chat', desc: 'User shares an idea via the widget' },
  { icon: '📋', label: 'Issue', desc: 'AI refines it into a GitHub issue' },
  { icon: '🤖', label: 'Agent', desc: 'Claude implements the change' },
  { icon: '✅', label: 'Preview', desc: 'PR created, preview deploys' },
  { icon: '🚀', label: 'Deployed', desc: 'You approve → it ships' },
]

const CYCLE_DURATION = 4 // seconds
const STAGE_DELAY = CYCLE_DURATION / STAGES.length // 0.8s per stage

export function PipelineExplainer() {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-fg">How the Pipeline Works</h2>
      <div className="glass-card p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
          {STAGES.flatMap((stage, i) => {
            const card = (
              <div
                key={stage.label}
                className="flex-1 rounded-xl border border-white/[0.07] p-3 sm:p-4"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  animationName: 'pipeline-stage-pulse',
                  animationDuration: `${CYCLE_DURATION}s`,
                  animationTimingFunction: 'ease-in-out',
                  animationIterationCount: 'infinite',
                  animationFillMode: 'backwards',
                  animationDelay: `${i * STAGE_DELAY}s`,
                }}
              >
                <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
                  <span className="text-2xl leading-none" role="img" aria-label={stage.label}>
                    {stage.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-fg">{stage.label}</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-muted">{stage.desc}</p>
                  </div>
                </div>
              </div>
            )

            if (i === STAGES.length - 1) return [card]

            const connector = (
              <div
                key={`conn-${i}`}
                className="flex shrink-0 items-center justify-center sm:w-5"
              >
                {/* Desktop: horizontal flowing dots */}
                <div className="relative hidden h-0.5 w-5 overflow-hidden rounded-full bg-white/[0.07] sm:block">
                  <span className="flow-dot" />
                  <span className="flow-dot" />
                  <span className="flow-dot" />
                </div>
                {/* Mobile: vertical down arrow */}
                <div className="flex h-5 w-5 items-center justify-center sm:hidden">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    className="text-muted"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 1v8M2.5 6L5 8.5 7.5 6"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            )

            return [card, connector]
          })}
        </div>
      </div>
    </div>
  )
}
