-- Add strategic nudges to projects
ALTER TABLE feedback_chat.projects
ADD COLUMN IF NOT EXISTS strategic_nudges text[] DEFAULT '{}';

-- User-submitted ideas for the strategize pipeline
CREATE TABLE IF NOT EXISTS feedback_chat.user_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES feedback_chat.projects(id) ON DELETE CASCADE,
  text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'incorporated', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_ideas_project
  ON feedback_chat.user_ideas(project_id, status, created_at DESC);

ALTER TABLE feedback_chat.user_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_ideas_all_own_project"
  ON feedback_chat.user_ideas
  FOR ALL USING (project_id IN (SELECT id FROM feedback_chat.projects WHERE user_id = auth.uid()));
