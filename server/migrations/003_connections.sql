-- Connections between members (request → accept) and blocks.
-- One row per pair, stored with the smaller id first, so A→B and B→A can never both exist.

create table connections (
  user_a text not null references users (id) on delete cascade,
  user_b text not null references users (id) on delete cascade,
  requested_by text not null references users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);
create index connections_b_idx on connections (user_b);

create table blocks (
  blocker_id text not null references users (id) on delete cascade,
  blocked_id text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on blocks (blocked_id);
