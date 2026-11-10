-- Events foundation (Phase 1, step 4c). Events belong to a community and follow its
-- visibility; an event can additionally be invite-only within its community.
-- Times are stored as timestamptz (an absolute instant) plus the organiser's time zone name,
-- so every viewer sees the right local time (EVT-04).

create table events (
  id text primary key,
  community_id text not null references communities (id) on delete cascade,
  host_id text not null references users (id),
  title text not null check (char_length(title) between 1 and 140),
  description text check (char_length(description) <= 5000),
  event_type text not null default 'Meetup',
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  timezone text not null default 'Asia/Kolkata',
  location text check (char_length(location) <= 300),
  -- { freq: 'none'|'daily'|'weekly'|'monthly', until?: ISO } — same rule the web app expands.
  recurrence jsonb not null default '{"freq": "none"}'::jsonb,
  invite_only boolean not null default false,
  rsvp_enabled boolean not null default true,
  capacity integer check (capacity is null or capacity > 0),
  -- RSVPs close at this instant (EVT-07); null = open until the event ends.
  rsvp_deadline timestamptz,
  reminders integer[] not null default '{}',
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (end_at >= start_at)
);
create index events_community_idx on events (community_id, start_at);

-- Co-hosts who can edit the event alongside the host.
create table event_staff (
  event_id text not null references events (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  primary key (event_id, user_id)
);

create table event_invitees (
  event_id text not null references events (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  primary key (event_id, user_id)
);

-- One RSVP per member per event (EVT-01).
create table event_rsvps (
  event_id text not null references events (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  status text not null check (status in ('going', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_rsvps_user_idx on event_rsvps (user_id);

create table event_comments (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  author_id text not null references users (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index event_comments_event_idx on event_comments (event_id, created_at);
