-- v2 brief, decision P4: every parked browser-only module has a switch. Their pages are off
-- (no routes) until a Platform Admin turns them on; their browser data stays where it is.
insert into feature_flags (key, enabled, description) values
  ('module.forums', false, 'Forums (parked: Discussions replace them)'),
  ('module.files', false, 'Files (parked: Resources replace them)'),
  ('module.manuals', false, 'Manuals (parked: Resources replace them)'),
  ('module.orgchart', false, 'Community structure chart (parked)')
on conflict (key) do nothing;
