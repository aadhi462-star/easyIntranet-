-- Redesign Stage 4 (engagement). Approved decisions S4-1..S4-6 (HANDOFF.md).

-- S4-1: uploaded files live in the database (AppSail's app folder is wiped on every upload),
-- up to 10 MB each, behind lib/files.js so moving to object storage later is a swap. A file
-- belongs to one community and is only served after that community's access check (FIL-05).
-- Stored under a generated id; the name is display-only, so equal names never collide (FIL-08).
create table files (
  id text primary key,
  community_id text not null references communities (id) on delete cascade,
  uploaded_by text references users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  mime text not null,
  kind text not null check (kind in ('pdf', 'image', 'office', 'text')),
  size integer not null check (size > 0 and size <= 10485760),
  sha256 text not null,
  data bytea not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index files_community_idx on files (community_id) where deleted_at is null;

-- Resources: a community's library of files and links. Community-owned: an author who leaves or
-- is deleted doesn't take them along (FIL-06). Replacing a file keeps the resource id and link
-- and bumps `version` (FIL-09).
create table resources (
  id text primary key,
  community_id text not null references communities (id) on delete cascade,
  kind text not null check (kind in ('file', 'link')),
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 1000),
  category text check (char_length(category) <= 40),
  url text check (char_length(url) <= 2000),
  file_id text references files (id),
  added_by text references users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'file' and file_id is not null) or (kind = 'link' and url is not null))
);
create index resources_community_idx on resources (community_id, created_at desc) where deleted_at is null;

-- S4-2: Discussions have topics, set by community admins (up to 12 per community).
create table topics (
  id text primary key,
  community_id text not null references communities (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index topics_name_idx on topics (community_id, lower(name));
alter table posts add column topic_id text references topics (id) on delete set null;

-- S4-3: images and PDFs on posts, up to 4 per post.
create table post_attachments (
  post_id text not null references posts (id) on delete cascade,
  file_id text not null references files (id),
  position integer not null default 0,
  primary key (post_id, file_id)
);

-- Notifications, created by the server. One per (recipient, dedupe key) so a retried action
-- never notifies twice (NTF-02). The text shown is built when read, from rows the reader may
-- still see, so a stored notification can't leak content after access changes (NTF-06, NTF-10).
create table notifications (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  kind text not null,
  actor_id text references users (id) on delete set null,
  community_id text references communities (id) on delete cascade,
  target_type text,
  target_id text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  emailed_at timestamptz,
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on notifications (user_id, created_at desc);

-- S4-5: email per kind; a missing row means the kind's default.
create table notification_prefs (
  user_id text not null references users (id) on delete cascade,
  kind text not null,
  email boolean not null,
  primary key (user_id, kind)
);

-- Saved posts, events and resources, kept on the account (was browser-only bookmarks).
create table saved_items (
  user_id text not null references users (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'event', 'resource')),
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

-- S4-4: a full event keeps a waitlist, promoted first come, first served.
alter table event_rsvps drop constraint event_rsvps_status_check;
alter table event_rsvps add constraint event_rsvps_status_check check (status in ('going', 'maybe', 'no', 'waitlist'));
alter table event_rsvps add column waitlisted_at timestamptz;
