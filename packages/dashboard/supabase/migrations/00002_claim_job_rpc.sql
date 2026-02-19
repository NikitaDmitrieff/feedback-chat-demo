-- p_skip_setup defaults to TRUE: old production workers skip setup jobs automatically.
-- New workers pass p_skip_setup => false to claim all job types.
CREATE OR REPLACE FUNCTION feedback_chat.claim_next_job(
  p_worker_id text,
  p_skip_setup boolean DEFAULT true
)
RETURNS json AS $$
DECLARE
  claimed feedback_chat.job_queue%rowtype;
BEGIN
  SELECT * INTO claimed
  FROM feedback_chat.job_queue
  WHERE status = 'pending'
    AND (NOT p_skip_setup OR job_type != 'setup')
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE feedback_chat.job_queue
  SET status = 'processing', worker_id = p_worker_id, locked_at = now()
  WHERE id = claimed.id;

  RETURN row_to_json(claimed);
END;
$$ LANGUAGE plpgsql;
