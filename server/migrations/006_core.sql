-- Redesign Stage 3 (core application): merging one community into another (decision R4, All
-- Hands → AlumniZone) so it can be undone, and a marker for finishing onboarding.

-- A merged community keeps its row (and its members) so the merge can be reversed; it is
-- hidden everywhere and its address leads to the community it was merged into.
alter table communities add column merged_into text references communities (id);

-- One row per merge: exactly what moved, so undoing it moves back only those things.
create table community_merges (
  id text primary key,
  from_id text not null references communities (id) on delete cascade,
  to_id text not null references communities (id) on delete cascade,
  moved_posts text[] not null default '{}',
  moved_events text[] not null default '{}',
  added_members text[] not null default '{}',
  previous_status text not null,
  merged_by text references users (id),
  merged_at timestamptz not null default now(),
  undone_at timestamptz
);
create index community_merges_from_idx on community_merges (from_id) where undone_at is null;

-- Set when someone finishes (or skips) the welcome steps after sign-up. Accounts that already
-- exist have been using the app, so they count as onboarded.
alter table users add column onboarded_at timestamptz;
update users set onboarded_at = created_at;
