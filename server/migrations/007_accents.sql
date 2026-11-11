-- Each community's accent colour (refined design system). AlumniZone is sky; the seeded
-- communities keep the accents from the approved designs; any other community gets one when
-- it is created (lib/community.js pickAccent). Lime is not an option: it is the platform's.
alter table communities add column accent text not null default 'violet'
  check (accent in ('sky', 'violet', 'amber', 'teal', 'rose', 'orange'));
update communities set accent = case id
  when 'alumnizone' then 'sky' when 'g2' then 'amber' when 'g4' then 'violet'
  when 'g7' then 'teal' when 'g3' then 'rose' when 'g5' then 'orange' else accent end;
