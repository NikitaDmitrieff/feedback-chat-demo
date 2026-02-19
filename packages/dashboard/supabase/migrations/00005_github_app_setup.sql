-- GitHub App auto-setup: installation tracking + setup job type

-- New columns on projects for GitHub App + setup state
ALTER TABLE feedback_chat.projects
  ADD COLUMN IF NOT EXISTS github_installation_id bigint,
  ADD COLUMN IF NOT EXISTS setup_status text NOT NULL DEFAULT 'pending'
    CHECK (setup_status IN (
      'pending', 'installing', 'queued', 'cloning', 'generating',
      'committing', 'pr_created', 'complete', 'failed'
    )),
  ADD COLUMN IF NOT EXISTS setup_pr_url text,
  ADD COLUMN IF NOT EXISTS setup_error text;

-- webhook_secret is no longer required (GitHub App projects don't need it)
ALTER TABLE feedback_chat.projects ALTER COLUMN webhook_secret DROP NOT NULL;

-- Job type discriminator: 'agent' (default, existing behavior) or 'setup'
ALTER TABLE feedback_chat.job_queue
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'agent'
    CHECK (job_type IN ('agent', 'setup'));

-- Index for worker to optionally filter by job_type
CREATE INDEX IF NOT EXISTS idx_job_queue_type_status
  ON feedback_chat.job_queue(job_type, status) WHERE status = 'pending';
