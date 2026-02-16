create or replace function claim_next_job(p_worker_id text)
returns json as $$
declare
  claimed job_queue%rowtype;
begin
  select * into claimed
  from job_queue
  where status = 'pending'
  order by created_at
  limit 1
  for update skip locked;

  if claimed.id is null then
    return null;
  end if;

  update job_queue
  set status = 'processing', worker_id = p_worker_id, locked_at = now()
  where id = claimed.id;

  return row_to_json(claimed);
end;
$$ language plpgsql;
