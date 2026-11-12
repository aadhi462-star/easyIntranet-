-- v2 brief (approved 12 Nov 2026): data changes that run once, by name, with a log of every row
-- they touch so they can be undone. The first one is P1: AlumniZone stops being a default
-- community (lib/data-migrations.js).
create table data_migrations (
  name text primary key,
  applied_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  undone_at timestamptz
);

create table migration_log (
  id bigserial primary key,
  migration text not null references data_migrations (name),
  table_name text not null,
  row_key jsonb not null,
  before jsonb not null,
  after jsonb not null,
  at timestamptz not null default now()
);
create index migration_log_migration_idx on migration_log (migration);
