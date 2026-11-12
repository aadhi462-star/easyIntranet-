-- v2 G8: the older browser-only admin tools (policies, profile fields, user labels, branding,
-- workflows, schedulers, data export, security, Smart Assist) leave the Administration menu.
-- They stay reachable only while this switch is on, like the other parked modules (P4).
insert into feature_flags (key, enabled, description) values
  ('admin.legacy', false, 'Older browser-only admin tools (parked)')
on conflict (key) do nothing;
