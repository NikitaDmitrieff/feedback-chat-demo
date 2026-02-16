const STAGE_LABELS: Record<string, string> = {
  created: 'Created',
  queued: 'Queued',
  running: 'Running',
  validating: 'Validating',
  preview_ready: 'Preview',
  deployed: 'Deployed',
  failed: 'Failed',
  rejected: 'Rejected',
}

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span className={`stage-badge stage-${stage}`}>
      {stage === 'running' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {STAGE_LABELS[stage] ?? stage}
    </span>
  )
}
