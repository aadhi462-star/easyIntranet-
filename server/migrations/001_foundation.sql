-- CommunityOne foundation: accounts, sessions, one-time tokens, platform roles, audit,
-- idempotency, email outbox, feature flags and platform settings.

create table users (
  id text primary key,
  email text not null,
  -- Uniqueness is case-insensitive and enforced by the database, so two simultaneous
  -- registrations can never both succeed (REG-01, REG-02).
  email_norm text generated always as (lower(email)) stored,
  name text not null,
  password_hash text not null,
  status text not null default 'unverified'
    check (status in ('unverified', 'pending_approval', 'active', 'suspended', 'deactivated', 'deleted')),
  email_verified_at timestamptz,
  pending_email text,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  password_changed_at timestamptz not null default now(),
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index users_email_norm_key on users (email_norm);

create table sessions (
  -- Only a SHA-256 of the cookie value is stored, so a database leak can't be replayed.
  id_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip text,
  user_agent text
);
create index sessions_user_idx on sessions (user_id);

create table auth_tokens (
  id bigserial primary key,
  user_id text not null references users (id) on delete cascade,
  purpose text not null check (purpose in ('verify_email', 'reset_password', 'change_email')),
  token_hash text not null unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  superseded_at timestamptz
);
create index auth_tokens_user_purpose_idx on auth_tokens (user_id, purpose);

create table platform_roles (
  user_id text not null references users (id) on delete cascade,
  role text not null check (role in ('super_admin', 'platform_admin', 'user_manager', 'community_manager',
    'lms_manager', 'trust_safety', 'finance_manager', 'support_agent')),
  granted_by text references users (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  context jsonb not null default '{}'::jsonb,
  ip text
);
create index audit_log_at_idx on audit_log (at desc);
create index audit_log_target_idx on audit_log (target_type, target_id);

create table idempotency_keys (
  scope text not null,
  key text not null,
  route text not null,
  status_code integer,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (scope, key)
);

create table email_outbox (
  id bigserial primary key,
  to_email text not null,
  template text not null,
  subject text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table feature_flags (
  key text primary key,
  enabled boolean not null,
  description text,
  updated_by text references users (id),
  updated_at timestamptz not null default now()
);

create table platform_settings (
  key text primary key,
  value jsonb not null,
  version integer not null default 1,
  updated_by text references users (id),
  updated_at timestamptz not null default now()
);

insert into platform_settings (key, value) values
  ('general', '{"name": "CommunityOne", "tagline": "One Platform. Every Community."}'::jsonb),
  ('registration', '{"open": true, "requireApproval": false, "allowedDomains": []}'::jsonb),
  ('security', '{"sessionDays": 14, "maxFailedLogins": 5, "lockMinutes": 15}'::jsonb);

-- Modules outside the CommunityOne navigation are parked, not deleted (decision D2).
insert into feature_flags (key, enabled, description) values
  ('module.tasks', false, 'Tasks & Boards (parked)'),
  ('module.apps', false, 'Custom Apps (parked)'),
  ('module.webtabs', false, 'Web Tabs (parked)'),
  ('module.live', false, 'Live & Meetings (parked: needs a media server)'),
  ('module.townhalls', false, 'Town Halls (parked: becomes an event type)'),
  ('module.channels', false, 'Channels & Chats (parked)'),
  ('module.surveys', false, 'Surveys (parked)'),
  ('module.ideas', false, 'Ideas (parked)'),
  ('module.leaderboard', false, 'Recognition leaderboard (parked)'),
  ('module.assist', false, 'Smart Assist AI (parked until Phase 5)'),
  ('learning', true, 'Community Learning module (global switch)');
