-- Redesign Stage 5a (learning): courses inside communities. Decisions D1–D6 (HANDOFF.md).

create table courses (
  id text primary key,
  community_id text not null references communities (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text check (char_length(description) <= 4000),
  objectives jsonb not null default '[]'::jsonb,
  requirements text check (char_length(requirements) <= 1000),
  category text check (char_length(category) <= 40),
  -- draft → published ⇄ unpublished; any → archived. Unpublished: no new enrolments, enrolled
  -- learners keep access (D5, LMS-03). Archived: read-only for those enrolled.
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'archived')),
  -- 'members': in the catalogue; 'hidden': only with the link.
  visibility text not null default 'members' check (visibility in ('members', 'hidden')),
  capacity integer check (capacity is null or capacity > 0),
  created_by text references users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index courses_community_idx on courses (community_id);

-- D1: an Instructor is assigned per course, never per community (LMS-14).
create table course_instructors (
  course_id text not null references courses (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table course_modules (
  id text primary key,
  course_id text not null references courses (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  position integer not null default 0
);

-- D2: text, files from the Stage 4 store, or a link that opens outside.
create table lessons (
  id text primary key,
  course_id text not null references courses (id) on delete cascade,
  module_id text not null references course_modules (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  kind text not null default 'text' check (kind in ('text', 'file', 'link')),
  body text check (char_length(body) <= 20000),
  url text check (char_length(url) <= 2000),
  file_ids text[] not null default '{}',
  duration_min integer check (duration_min is null or duration_min between 1 and 600),
  required boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index lessons_course_idx on lessons (course_id);

-- One row per learner and course (LMS-06). 'left' keeps the history; progress stays either way
-- and comes back on rejoining (D4, LMS-09). completed_at is kept when the course changes later (D6).
create table enrollments (
  course_id text not null references courses (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  status text not null check (status in ('active', 'waitlist', 'left')),
  enrolled_at timestamptz,
  waitlisted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

-- One row per learner and lesson, however often it's marked (LMS-05, LMS-12).
create table lesson_progress (
  lesson_id text not null references lessons (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  course_id text not null references courses (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (lesson_id, user_id)
);
create index lesson_progress_course_idx on lesson_progress (course_id, user_id);
