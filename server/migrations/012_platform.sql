-- Redesign Stage 7 (platform administration). Decisions D1–D8 on the S7Plan board (approved
-- 12 Nov 2026): community deletion with a 30-day restore, suspension, fresh-password checks,
-- the moderation centre, logged exports, announcements and forward-only settings.

-- D1/D2: a deleted community disappears at once, can be restored for 30 days, then the job
-- removes it in steps that can resume (DEL-13, DEL-14). `status_reason` is the reason shown to
-- staff for a suspension or a deletion.
alter table communities drop constraint communities_status_check;
alter table communities add constraint communities_status_check check (status in ('active', 'archived', 'suspended', 'deleted'));
alter table communities
  add column status_reason text check (char_length(status_reason) <= 1000),
  add column status_before text,
  add column deleted_at timestamptz,
  add column deleted_by text references users (id) on delete set null,
  add column purge_after timestamptz,
  add column purge_step text;
create index communities_purge_idx on communities (purge_after) where status = 'deleted';

-- What's left once a community is removed for good: enough to tell an old link "This community
-- has been removed" (DEL-12) and nothing else.
create table removed_communities (
  id text primary key,
  slug text,
  name text not null,
  removed_at timestamptz not null default now()
);

-- DEL-15: opening a request marks it as yours so two admins don't decide it at once.
alter table deletion_requests add column review_by text references users (id) on delete set null, add column review_at timestamptz;

-- D4: entering your password again for the riskiest actions. Signing in counts.
alter table sessions add column password_at timestamptz;
update sessions set password_at = created_at;

-- D5: a community can hand a case to the platform.
alter table moderation_cases add column escalated_at timestamptz, add column escalated_by text references users (id) on delete set null,
  add column escalation_note text check (char_length(escalation_note) <= 1000);

-- D7: one in-app announcement at a time, to everyone or to members of chosen communities.
create table announcements (
  id text primary key,
  message text not null check (char_length(message) between 1 and 280),
  link text check (char_length(link) <= 300),
  audience text not null default 'all' check (audience in ('all', 'communities')),
  community_ids text[] not null default '{}',
  ends_at timestamptz,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index announcements_live_idx on announcements (created_at desc) where ended_at is null;

create table announcement_dismissals (
  announcement_id text not null references announcements (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- D8: settings sections the platform reads. Lowering a limit applies to new uploads only.
insert into platform_settings (key, value) values
  ('files', '{"maxFileMb": 10, "types": ["pdf", "image", "office", "text"]}'::jsonb),
  ('communities', '{"whoCanCreate": "anyone"}'::jsonb)
on conflict (key) do nothing;

create index audit_log_actor_idx on audit_log (actor_id, at desc);
