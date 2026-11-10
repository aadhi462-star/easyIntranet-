-- Profiles and the alumni structure (decision D4: institutions, departments and graduation
-- batches are first-class). Education rows tie a member to institution → department → batch.

create table institutions (
  id text primary key,
  name text not null,
  name_norm text generated always as (lower(name)) stored,
  short_name text,
  city text,
  country text,
  created_at timestamptz not null default now()
);
create unique index institutions_name_norm_key on institutions (name_norm);

create table departments (
  id text primary key,
  institution_id text not null references institutions (id) on delete restrict,
  name text not null,
  name_norm text generated always as (lower(name)) stored,
  created_at timestamptz not null default now()
);
create unique index departments_inst_name_key on departments (institution_id, name_norm);

create table profiles (
  user_id text primary key references users (id) on delete cascade,
  headline text check (char_length(headline) <= 120),
  bio text check (char_length(bio) <= 2000),
  city text check (char_length(city) <= 80),
  country text check (char_length(country) <= 80),
  company text check (char_length(company) <= 120),
  job_title text check (char_length(job_title) <= 120),
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  -- Month and day only ("MM-DD"): no birth year is stored.
  birthday text check (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  linkedin text check (char_length(linkedin) <= 100),
  mentor_open boolean not null default false,
  custom_fields jsonb not null default '{}'::jsonb,
  avatar_hue integer not null default 200,
  -- Who may see email, birthday and contact-style fields.
  contact_visibility text not null default 'everyone' check (contact_visibility in ('everyone', 'connections', 'nobody')),
  directory_visible boolean not null default true,
  completeness_dismissed boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table education (
  id bigserial primary key,
  user_id text not null references users (id) on delete cascade,
  institution_id text not null references institutions (id) on delete restrict,
  department_id text references departments (id) on delete set null,
  programme text check (char_length(programme) <= 120),
  grad_year integer check (grad_year between 1950 and 2100),
  is_primary boolean not null default false,
  position integer not null default 0
);
create index education_user_idx on education (user_id);
create index education_batch_idx on education (institution_id, grad_year);
-- At most one primary education per member.
create unique index education_one_primary on education (user_id) where is_primary;

create table experience (
  id bigserial primary key,
  user_id text not null references users (id) on delete cascade,
  title text not null check (char_length(title) <= 120),
  org text not null check (char_length(org) <= 120),
  from_year integer check (from_year between 1950 and 2100),
  to_year integer check (to_year between 1950 and 2100),
  position integer not null default 0,
  check (to_year is null or from_year is null or to_year >= from_year)
);
create index experience_user_idx on experience (user_id);
