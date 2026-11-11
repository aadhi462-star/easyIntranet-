-- Redesign Stage 6 (community management): reporting, moderation cases, sanctions, appeals and
-- deletion requests. Decisions D1–D8 on the S6Plan board (approved 12 Nov 2026).

-- One case per reported item while it's open: every report about the same post, reply, event or
-- member joins it (MOD-02). `snapshot` is the item as it was at the first report (MOD-11).
-- `audience` says who may review it (D1): a community's moderators, its Owners only (the item is
-- by a Moderator or Admin), or Platform Admins (the item is by an Owner).
create table moderation_cases (
  id text primary key,
  community_id text not null references communities (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'event', 'member')),
  target_id text not null,
  subject_id text references users (id) on delete set null,
  snapshot jsonb not null,
  audience text not null check (audience in ('moderators', 'owners', 'platform')),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  decision text check (decision in ('dismiss', 'remove', 'warn', 'restrict', 'remove_member', 'block')),
  decision_reason text check (char_length(decision_reason) <= 500),
  report_count integer not null default 0,
  opened_at timestamptz not null default now(),
  last_report_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text references users (id) on delete set null,
  restored_at timestamptz,
  lock_by text references users (id) on delete set null,
  lock_at timestamptz
);
create unique index moderation_cases_open_idx on moderation_cases (target_type, target_id) where status = 'open';
create index moderation_cases_queue_idx on moderation_cases (community_id, status, last_report_at);

-- Each reporter's own report; reporting the same item again updates it (MOD-02).
create table reports (
  id text primary key,
  case_id text not null references moderation_cases (id) on delete cascade,
  reporter_id text references users (id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'misleading', 'off_topic', 'other')),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, reporter_id)
);
create index reports_reporter_idx on reports (reporter_id, created_at);

-- The case history: every step, who and why (MOD-05).
create table case_events (
  id text primary key,
  case_id text not null references moderation_cases (id) on delete cascade,
  actor_id text references users (id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index case_events_case_idx on case_events (case_id, created_at);

-- Warnings and restrictions on a membership (D3). A restriction reuses the `restricted`
-- membership state; `until` null means until lifted. Removals and blocks are recorded here too.
create table sanctions (
  id text primary key,
  community_id text not null references communities (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  case_id text references moderation_cases (id) on delete set null,
  kind text not null check (kind in ('warn', 'restrict', 'remove', 'block')),
  reason text not null check (char_length(reason) between 1 and 500),
  until timestamptz,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by text references users (id) on delete set null
);
create index sanctions_member_idx on sanctions (community_id, user_id, created_at desc);
create index sanctions_due_idx on sanctions (until) where kind = 'restrict' and lifted_at is null;

-- One appeal per action, within 14 days, decided by someone who didn't take it (D4, MOD-06).
create table appeals (
  id text primary key,
  case_id text not null references moderation_cases (id) on delete cascade,
  community_id text not null references communities (id) on delete cascade,
  appellant_id text not null references users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'upheld', 'overturned')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text references users (id) on delete set null,
  decision_note text check (char_length(decision_note) <= 1000),
  unique (case_id, appellant_id)
);

-- Owners ask for deletion; a Platform Admin decides (D6, Stage 7). One open request at a time.
create table deletion_requests (
  id text primary key,
  community_id text not null references communities (id) on delete cascade,
  requested_by text references users (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'withdrawn', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text references users (id) on delete set null,
  decision_note text check (char_length(decision_note) <= 1000)
);
create unique index deletion_requests_open_idx on deletion_requests (community_id) where status = 'open';

-- Replies and events removed by a moderator can be restored for 30 days (D3); posts already
-- have status 'removed' with removed_by and removed_reason.
alter table comments add column removed_at timestamptz, add column removed_by text references users (id) on delete set null;
alter table events add column removed_at timestamptz, add column removed_by text references users (id) on delete set null;
alter table posts add column removed_at timestamptz;
