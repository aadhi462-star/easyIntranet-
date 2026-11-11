-- Redesign Stage 5b (assessment): quizzes, assignments, grading and certificates. Decisions D7, D8.
-- Quizzes and assignments are lessons of their own kind, so they sit in the outline and count
-- towards completion like any lesson. Their progress row is written only when they're passed.

alter table lessons drop constraint lessons_kind_check;
alter table lessons add constraint lessons_kind_check check (kind in ('text', 'file', 'link', 'quiz', 'assignment'));

-- D7: multiple choice, an attempt limit (default 3), the best score counts, a server-side deadline.
-- `version` goes up whenever the questions change; an attempt keeps the questions it started with (ASM-04).
create table quizzes (
  lesson_id text primary key references lessons (id) on delete cascade,
  pass_percent integer not null default 70 check (pass_percent between 1 and 100),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  due_at timestamptz,
  version integer not null default 1
);

-- Validated on save: 2–6 choices and an answer that is one of them (ASM-13).
create table quiz_questions (
  id text primary key,
  lesson_id text not null references quizzes (lesson_id) on delete cascade,
  position integer not null,
  prompt text not null check (char_length(prompt) between 1 and 1000),
  choices jsonb not null,
  answer integer not null
);
create index quiz_questions_lesson_idx on quiz_questions (lesson_id, position);

-- One row per attempt, numbered per learner and quiz; the number is unique, so the limit holds
-- across tabs and devices (ASM-14). At most one attempt is open at a time: starting again resumes
-- it, with the answers saved so far (ASM-02). `questions` is the copy the attempt was started with.
create table quiz_attempts (
  id text primary key,
  lesson_id text not null references quizzes (lesson_id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  number integer not null,
  quiz_version integer not null,
  questions jsonb not null,
  answers jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer,
  total integer,
  passed boolean,
  unique (lesson_id, user_id, number)
);
create unique index quiz_attempts_open_idx on quiz_attempts (lesson_id, user_id) where submitted_at is null;

-- An assignment: the lesson's text is the instructions. Late work is accepted and marked late.
create table assignments (
  lesson_id text primary key references lessons (id) on delete cascade,
  points integer not null default 10 check (points between 1 and 1000),
  pass_points integer not null default 6,
  due_at timestamptz,
  check (pass_points between 0 and points)
);

-- One submission per learner and assignment; it can be sent again until it's graded as passed.
-- The grade keeps the points and pass mark it was given against (ASM-05). `lock_by` is the one
-- instructor grading it right now (ASM-06); a lock older than 30 minutes can be taken over.
create table submissions (
  id text primary key,
  lesson_id text not null references assignments (lesson_id) on delete cascade,
  course_id text not null references courses (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  body text check (char_length(body) <= 20000),
  file_ids text[] not null default '{}',
  status text not null default 'submitted' check (status in ('submitted', 'returned')),
  submitted_at timestamptz not null default now(),
  late boolean not null default false,
  draft_grade integer,
  draft_feedback text check (char_length(draft_feedback) <= 5000),
  grade integer,
  feedback text check (char_length(feedback) <= 5000),
  graded_points integer,
  graded_pass integer,
  passed boolean,
  graded_by text references users (id) on delete set null,
  returned_at timestamptz,
  lock_by text references users (id) on delete set null,
  lock_at timestamptz,
  version integer not null default 1,
  unique (lesson_id, user_id)
);
create index submissions_course_idx on submissions (course_id, status);

-- D8: issued once per learner and course, when the course is completed. The names are copied in,
-- so a certificate still verifies after the course is renamed or deleted (ASM-10, ASM-11).
create table certificates (
  id text primary key,
  code text not null unique,
  user_id text not null references users (id) on delete cascade,
  course_id text references courses (id) on delete set null,
  community_id text references communities (id) on delete set null,
  name text not null,
  course_title text not null,
  community_name text not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, course_id)
);

-- Courses completed before certificates existed get theirs now. Codes avoid 0 and 1 (read as O and I),
-- like the ones the server issues.
insert into certificates (id, code, user_id, course_id, community_id, name, course_title, community_name, issued_at)
select 'cert_' || substr(md5(e.course_id || e.user_id), 1, 16),
       translate(upper(substr(md5(random()::text || e.course_id || e.user_id), 1, 4) || '-' || substr(md5(random()::text || e.user_id), 1, 4)), '01', 'GH'),
       e.user_id, e.course_id, c.community_id, u.name, c.title, co.name, e.completed_at
  from enrollments e join courses c on c.id = e.course_id join users u on u.id = e.user_id join communities co on co.id = c.community_id
 where e.completed_at is not null;
