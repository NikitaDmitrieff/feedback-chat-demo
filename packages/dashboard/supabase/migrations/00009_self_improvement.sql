-- Self-improvement pipeline: failure classification + improvement job tracking

-- Track failure analysis on pipeline_runs
ALTER TABLE feedback_chat.pipeline_runs
  ADD COLUMN IF NOT EXISTS failure_category text,
  ADD COLUMN IF NOT EXISTS failure_analysis text,
  ADD COLUMN IF NOT EXISTS improvement_job_id uuid REFERENCES feedback_chat.job_queue(id);

-- Link improvement jobs back to the failed run that triggered them
ALTER TABLE feedback_chat.job_queue
  ADD COLUMN IF NOT EXISTS source_run_id uuid REFERENCES feedback_chat.pipeline_runs(id);

-- Expand job_type CHECK constraint to include 'self_improve'
-- (00005 added: CHECK (job_type IN ('agent', 'setup')))
ALTER TABLE feedback_chat.job_queue DROP CONSTRAINT IF EXISTS job_queue_job_type_check;
ALTER TABLE feedback_chat.job_queue ADD CONSTRAINT job_queue_job_type_check
  CHECK (job_type IN ('agent', 'setup', 'self_improve'));

-- Index for finding runs with failure analysis
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_failure
  ON feedback_chat.pipeline_runs(failure_category) WHERE failure_category IS NOT NULL;
