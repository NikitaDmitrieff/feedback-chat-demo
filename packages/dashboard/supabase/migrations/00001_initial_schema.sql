-- Projects: one per repo
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  github_repo text not null,
  webhook_secret text not null,
  created_at timestamptz default now()
);

-- API keys: one per project, used by widget's status handler
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  key_hash text not null,
  prefix text not null,
  created_at timestamptz default now()
);

-- Credentials: user's Claude keys, encrypted
create table credentials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  type text not null check (type in ('anthropic_api_key', 'claude_oauth')),
  encrypted_value text not null,
  created_at timestamptz default now()
);

-- Job queue: Postgres-based, workers poll this
create table job_queue (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  github_issue_number int not null,
  issue_title text not null default '',
  issue_body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  worker_id text,
  locked_at timestamptz,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Pipeline runs: the history view for the dashboard
create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references job_queue(id) on delete cascade,
  project_id uuid references projects(id) not null,
  github_issue_number int not null,
  github_pr_number int,
  stage text not null default 'queued',
  triggered_by text,
  started_at timestamptz default now(),
  completed_at timestamptz,
  result text check (result in ('success', 'failed', 'rejected'))
);

-- Run logs: streaming logs from the worker
create table run_logs (
  id bigint generated always as identity primary key,
  run_id uuid references pipeline_runs(id) on delete cascade not null,
  timestamp timestamptz default now(),
  level text default 'info',
  message text not null
);

-- Indexes for common queries
create index idx_job_queue_status on job_queue(status) where status = 'pending';
create index idx_pipeline_runs_project on pipeline_runs(project_id, started_at desc);
create index idx_run_logs_run on run_logs(run_id, timestamp);
create index idx_api_keys_hash on api_keys(key_hash);

-- RLS policies
alter table projects enable row level security;
alter table api_keys enable row level security;
alter table credentials enable row level security;
alter table job_queue enable row level security;
alter table pipeline_runs enable row level security;
alter table run_logs enable row level security;

-- Users can only see their own projects
create policy "Users see own projects" on projects
  for all using (auth.uid() = user_id);

-- API keys visible via project ownership
create policy "Users see own api_keys" on api_keys
  for all using (project_id in (select id from projects where user_id = auth.uid()));

-- Credentials visible via project ownership
create policy "Users see own credentials" on credentials
  for all using (project_id in (select id from projects where user_id = auth.uid()));

-- Job queue visible via project ownership
create policy "Users see own jobs" on job_queue
  for all using (project_id in (select id from projects where user_id = auth.uid()));

-- Pipeline runs visible via project ownership
create policy "Users see own runs" on pipeline_runs
  for all using (project_id in (select id from projects where user_id = auth.uid()));

-- Run logs visible via run ownership
create policy "Users see own logs" on run_logs
  for all using (run_id in (
    select pr.id from pipeline_runs pr
    join projects p on pr.project_id = p.id
    where p.user_id = auth.uid()
  ));
