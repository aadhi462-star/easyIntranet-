-- v2 brief Part 11, system health (PROPOSAL_V2 §3.5). Every background job run is recorded so a
-- Platform Admin can see when each job last ran, last succeeded and why it last failed. The
-- runner (lib/jobs.js) prunes rows older than 7 days on each pass, so the table stays small.
create table job_runs (
  id bigserial primary key,
  job text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  ok boolean not null,
  -- The error message only, truncated, with email addresses masked.
  error text check (char_length(error) <= 500),
  -- What the job reported doing (posts published, reminders sent...), when it returns a count.
  count integer
);
create index job_runs_job_idx on job_runs (job, started_at desc);
create index job_runs_started_idx on job_runs (started_at);
