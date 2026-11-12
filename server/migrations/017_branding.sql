-- Community branding (v2 workstream E, PROPOSAL_V2 §3.2): each community's logo and cover are
-- images from its own file store (lib/files.js). Removing the file clears the picture; the
-- community keeps its accent and lettered tile as the fallback.
alter table communities add column logo_file_id text references files (id) on delete set null;
alter table communities add column cover_file_id text references files (id) on delete set null;
