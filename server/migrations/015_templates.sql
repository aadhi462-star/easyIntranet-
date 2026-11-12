-- v2 brief, Part 4 (PROPOSAL_V2 §3.3 and §5): community templates. A template has versions; each
-- version holds a questionnaire and a blueprint. A community made from a template records which
-- template and version it came from and keeps its own copy of the configuration, so publishing a
-- new version or deactivating the template never changes it.
create table community_templates (
  id text primary key,
  key text not null check (key ~ '^[a-z][a-z0-9-]{1,39}$'),
  category text not null,
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 1000),
  -- draft: never published; published: offered when creating a community; inactive: hidden
  -- from creation (communities made from it keep working).
  status text not null default 'draft' check (status in ('draft', 'published', 'inactive')),
  current_version integer,
  -- Optimistic check for the administration screens (two admins editing the same draft).
  revision integer not null default 1,
  created_by text references users (id),
  created_at timestamptz not null default now()
);
create unique index community_templates_key on community_templates (lower(key));

-- A version with published_at null is the draft being edited (at most one per template).
create table template_versions (
  template_id text not null references community_templates (id) on delete cascade,
  version integer not null check (version >= 1),
  questionnaire jsonb not null default '[]'::jsonb,
  blueprint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by text references users (id),
  unique (template_id, version)
);
create unique index template_versions_one_draft on template_versions (template_id) where published_at is null;

-- Null for a community made from scratch.
alter table communities add column template_id text references community_templates (id);
alter table communities add column template_version integer;
create index communities_template_idx on communities (template_id, template_version) where template_id is not null;
