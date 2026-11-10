-- Community foundation (Phase 1, step 4b): communities, memberships, posts, comments, reactions,
-- polls and Mandatory Read acknowledgements. Community is the unit that decides who sees what.

create table communities (
  id text primary key,
  slug text not null,
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 1000),
  category text,
  emoji text,
  -- public: discoverable, content visible to signed-in members of the platform, join instantly
  -- private: discoverable, content for members only, join by request
  -- closed: hidden from discovery, members only, join by invitation
  visibility text not null check (visibility in ('public', 'private', 'closed')),
  status text not null default 'active' check (status in ('active', 'archived', 'suspended')),
  settings jsonb not null default '{}'::jsonb,
  created_by text references users (id),
  created_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index communities_slug_key on communities (lower(slug));

create table memberships (
  community_id text not null references communities (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'moderator', 'instructor', 'teaching_assistant', 'member')),
  -- Membership states are separate from roles (prompt §8).
  state text not null default 'active' check (state in ('active', 'pending', 'invited', 'restricted', 'removed', 'blocked', 'left')),
  request_message text check (char_length(request_message) <= 500),
  joined_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index memberships_user_idx on memberships (user_id, state);
-- Exactly one active owner per community at most (ownership transfer swaps it atomically).
create unique index memberships_one_owner on memberships (community_id) where role = 'owner' and state = 'active';

create table posts (
  id text primary key,
  community_id text not null references communities (id) on delete cascade,
  author_id text not null references users (id),
  type text not null default 'post' check (type in ('post', 'announcement', 'question', 'poll')),
  body text not null check (char_length(body) between 1 and 5000),
  status text not null default 'published' check (status in ('draft', 'scheduled', 'pending', 'published', 'removed')),
  publish_at timestamptz,
  pinned boolean not null default false,
  mentions text[] not null default '{}',
  -- Mandatory Read: { message, button, deadline } when set; acknowledgements in post_acks.
  mandatory jsonb,
  removed_by text references users (id),
  removed_reason text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  version integer not null default 1
);
create index posts_feed_idx on posts (community_id, status, published_at desc);
create index posts_author_idx on posts (author_id);

create table poll_options (
  id text primary key,
  post_id text not null references posts (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  position integer not null default 0
);
create unique index poll_options_label_key on poll_options (post_id, lower(label));

create table poll_votes (
  post_id text not null references posts (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  option_id text not null references poll_options (id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (post_id, user_id)          -- one vote per member per poll
);

create table comments (
  id text primary key,
  post_id text not null references posts (id) on delete cascade,
  author_id text not null references users (id),
  parent_id text references comments (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index comments_post_idx on comments (post_id, created_at);

-- One like and at most one mood per member per post (CNT-16).
create table reactions (
  post_id text not null references posts (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  kind text not null check (kind in ('like', 'happy', 'neutral', 'sad')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);
create unique index reactions_one_mood on reactions (post_id, user_id) where kind <> 'like';

create table post_acks (
  post_id text not null references posts (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
