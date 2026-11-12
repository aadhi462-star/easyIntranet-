-- v2 workstream F: invitations to a community (MASTER_BRIEF_V2 Part 5: a Closed community needs a
-- valid invitation). An invitation names one person, by account or by email, and is the only way
-- into a Closed community. Only the SHA-256 of its token is stored, like sessions, so a database
-- leak can't be replayed (the link in the email is the only copy of the token).
create table community_invitations (
  id text primary key,
  community_id text not null references communities (id) on delete cascade,
  -- Invited by email (normalised to lower case) or by account, never both. An email invitation is
  -- bound to that address, not to whichever account holds it today: only an account whose
  -- verified email it is can accept it (VIS-09), and the Admin never learns which account that is.
  email text check (email = lower(email) and char_length(email) <= 254),
  user_id text references users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'moderator', 'admin')),
  token_hash text not null,
  invited_by text references users (id) on delete set null,
  message text check (char_length(message) <= 500),
  created_at timestamptz not null default now(),
  -- When the current link was sent (a resend moves it): a removal after it voids the invitation.
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by text references users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by text references users (id) on delete set null,
  -- An expired invitation that a newer one replaced: kept for the history, out of the way of
  -- "one open invitation per community and person".
  superseded_at timestamptz,
  check ((email is null) <> (user_id is null))
);
create unique index community_invitations_token_key on community_invitations (token_hash);
-- One open invitation per community and account, and per community and address (a second invite
-- returns the open one instead). One person can hold one of each; accepting either uses up both.
create unique index community_invitations_open_user on community_invitations (community_id, user_id)
  where user_id is not null and accepted_at is null and revoked_at is null and superseded_at is null;
create unique index community_invitations_open_email on community_invitations (community_id, email)
  where email is not null and accepted_at is null and revoked_at is null and superseded_at is null;
create index community_invitations_community_idx on community_invitations (community_id, created_at desc);
create index community_invitations_user_idx on community_invitations (user_id) where user_id is not null;
create index community_invitations_email_idx on community_invitations (email) where email is not null;
