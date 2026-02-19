-- System-level credentials that persist across agent container restarts.
-- Used by the agent to store refreshed OAuth tokens so they survive redeployments.
CREATE TABLE IF NOT EXISTS feedback_chat.system_credentials (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- No RLS — only accessed by service_role key from the agent
ALTER TABLE feedback_chat.system_credentials ENABLE ROW LEVEL SECURITY;
