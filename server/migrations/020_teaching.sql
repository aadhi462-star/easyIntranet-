-- v2 workstream G7: a course lists Teaching Assistants beside its Instructors. Both are rows of
-- course_instructors; the role says which. An Instructor manages the course (edit, publish,
-- grade, see learners); a Teaching Assistant grades and sees learners but doesn't edit it.
-- Every existing row is an Instructor, as before.
alter table course_instructors add column role text not null default 'instructor' check (role in ('instructor', 'teaching_assistant'));

-- G10: a Platform Admin can ask for one more attempt at an email that used its 3. The retry job
-- takes failed emails from the last day, or ones a retry was asked for in the last day.
alter table email_outbox add column retry_requested_at timestamptz;
alter table email_outbox add column retry_requested_by text references users (id) on delete set null;
create index email_outbox_failed_idx on email_outbox (status, created_at desc) where status = 'failed';
