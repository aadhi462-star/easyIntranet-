-- v2 workstream F. F13: an event can have a category, chosen from the community's own list
-- (settings.eventCategories, up to 12, checked in routes/events.js). Older events have none.
alter table events add column category text check (char_length(category) between 1 and 40);

-- F9: the person invited can decline. A declined invitation is closed like an accepted or revoked
-- one, so it leaves "one open invitation per community and person" and a later invitation can be
-- made. declined_by is null when the link was declined while signed out.
alter table community_invitations add column declined_at timestamptz;
alter table community_invitations add column declined_by text references users (id) on delete set null;
drop index community_invitations_open_user;
create unique index community_invitations_open_user on community_invitations (community_id, user_id)
  where user_id is not null and accepted_at is null and revoked_at is null and superseded_at is null and declined_at is null;
drop index community_invitations_open_email;
create unique index community_invitations_open_email on community_invitations (community_id, email)
  where email is not null and accepted_at is null and revoked_at is null and superseded_at is null and declined_at is null;

-- F7: a Private community can ask one question with join requests (settings.joinQuestion); the
-- answer is kept with the request for the admins who decide it.
alter table memberships add column join_answer text check (char_length(join_answer) <= 500);
