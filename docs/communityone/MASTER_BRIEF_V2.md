# CommunityOne — Master product, architecture, UI/UX redesign and implementation brief (v2)

The user's brief, sent on 12 Nov 2026 during Stage 7, condensed faithfully. **It replaces earlier decisions where they differ** (flagged at the end). Status: **proposal and ETA owed; no implementation for this brief until the user approves.**

## Part 1 — Execution order (takes priority)
1. Finish the task in progress (Stage 7), test it, fix blockers, report.
2. Inspect the whole application: structure, architecture, frontend/backend, database entities and relationships, auth, reusable components, routes, landing page and app, unfinished features. Assume nothing works without checking.
3. Audit against this brief: architectural inconsistencies, what to preserve, missing multi-community capabilities, UI/UX problems, landing weaknesses, navigation, responsive, accessibility, missing interaction states, technical risks, migration needs.
4. Present, before changing anything: (1) existing task summary, (2) current assessment, (3) architectural changes, (4) AlumniZone migration and preservation strategy, (5) community creation and template system, (6) UI/UX audit findings, (7) visual direction, (8) landing redesign, (9) app redesign, (10) pages/components affected, (11) dependencies and risks, (12) implementation sequence, (13) estimate per workstream, (14) total. Realistic, from the actual codebase; separate development, testing and dependencies. **Wait for approval.**

## Part 2 — Identity and architecture
- **CommunityOne is the platform. AlumniZone is the application being transformed, not a default community.** Do not auto-create an AlumniZone community, make it mandatory or a parent, hardcode it in navigation, feature it as the default, assume users are alumni, auto-assign users to an Alumni community, or move all platform data into one. An authorised user may create an Alumni community like any other.
- Any domain: alumni, education, professional, technology, business, organisation, hobbies, general.
- Each community has its own name, logo, cover, description, category, branding, members, roles and permissions, discussions, announcements, events, resources, learning configuration, moderation, membership rules, privacy and notifications. Communities made from the same template are fully independent.
- Platform level: account, global profile, discovery, My Communities, global search, notifications, My Learning overview, platform administration. Community level: overview, discussions, events, resources, members, learning, moderation, settings. Learning lives inside communities; My Learning only aggregates.

## Part 3 — AlumniZone transformation and data preservation
- Inventory existing modules (auth, profiles, institutions, departments, batches, directory, connections, forums, files/manuals, town halls, events, tasks, boards, channels, surveys, ideas, leaderboards, custom apps, web tabs, live, admin tools). Keep useful functionality; park the rest behind flags; delete nothing for the rebrand.
- Proposed mappings to validate: Forums → Discussions; Files and manuals → Resources; Town halls → Events; Alumni directory → Member directory; Institutions → structured community associations; Departments → organisational structure; Batches → cohorts; Connections → member relationships; Tasks → future productivity.
- Migration plan: inventory, mapping, ownership, access restrictions, roles; validate keys, orphans, duplicates; list content needing manual community assignment; backups, rollback, logs; rehearse on representative data. **Do not auto-assign AlumniZone content to an Alumni community**, expose private data, or silently change permissions.

## Part 4 — Community creation
- **Method A, template:** Alumni, Education, Professional Networking, Technology, Business, Hobbies and Interests, Organisation, General. Flow: select, read the description, answer domain-specific questions (only the relevant ones), get a suggested configuration (name, description, category, sections, discussion categories, roles, permissions, membership, events, resource categories, learning, guidelines), review, customise, preview, validate, publish. Everything is editable.
- **Method B, from scratch:** full manual configuration, no template or questionnaire.
- Both share configuration, validation, preview, publishing and ownership assignment; a template never limits customisation.
- **Template administration (platform admins):** create, edit, publish, deactivate, manage questionnaires and blueprints, version, review usage. Updating a template never overwrites communities already made from it.

## Part 5 — Visibility, membership, permissions
- Public: discoverable, join at once, member-only content protected. Private: discoverable metadata, request to join, approved by admins. Closed: hidden from discovery, search and recommendations; invitation required.
- Enforced by the backend; no leaks through direct API calls, search, notification previews, file URLs, caches or public profiles.
- Platform roles: Super Admin, Platform Admin, User Manager, Community Manager, LMS Manager, Trust and Safety, Finance (if needed), Support. Community roles: Owner, Admin, Moderator, Instructor, Teaching Assistant, Member/Learner; different per community.
- Normal Mode and an audited, clearly shown Administrative Mode that never changes membership. Community admins request deletion; they never delete.

## Part 6 — References (principles, not templates)
Circle (primary: landing, hero, discovery, discussions, directory, navigation, events, learning), Linear (app interface, sidebar, type, density, search, tables, filters, admin), Notion (content hierarchy, organisation, readability), Mighty Networks (community + learning). Mapping: landing Circle + Notion; hero, discovery, overview, discussions, members, events Circle; navigation and admin Linear; Home Linear + Notion; learning Mighty Networks. Don't copy branding, logos, artwork or layouts.

## Part 7 — Design system
- **Light-first**, premium, minimal, spacious, accessible; dark mode optional.
- Starting tokens (validate contrast): background `#F7F8F6`, surface `#FFFFFF`, text `#17211F`, secondary text `#697570`, accent `#168C70`, border `#E6EBE7`.
- Inter with a clear type scale; nothing unnecessarily small. Tokens for spacing, grid, containers, radius, shadows, colour, icons, buttons, inputs, dialogs, menus, tables, cards, navigation; different experiences may use different layouts.
- **No emojis anywhere** (UI, empty states, status, labels, sample data, documentation, admin). Use Lucide or another consistent icon library.

## Part 8 — Landing page
- Nav: logo, About, Explore Communities, Features, Learning, Sign In, Get Started.
- Hero: "Find your people. Build your community." with the supporting line; CTAs Explore Communities (primary), Get Started. Use real product previews, not generic illustrations or floating decoration.
- Flow: nav, hero, discovery preview, capabilities, how it works, discussions and engagement, events and resources, learning, benefits, final CTA, footer; no repeated explanations. Public communities browsable before sign-up; **AlumniZone not featured as the default**.

## Part 9 — Authenticated app
- Desktop nav: Home, Explore, My Communities, My Learning, Events, Saved, Notifications, Profile. Mobile bottom bar: Home, Explore, Communities, Notifications, Profile.
- Home: relevant, prioritised (welcome, activity, discussions, events, updates, learning progress, recommended Public communities, quick actions). Explore: search, categories, filters, previews, logos, counts, visibility, membership state, actions. My Communities: only real memberships and managed ones, with role and status. Global search across accessible communities, members, discussions, events, resources, learning. Profile with privacy-respecting sections.

## Part 10 — Community experience
Sections Overview, Discussions, Learning, Events, Resources, Members, About, Settings, showing only enabled and permitted modules. Overview: branding, description, announcements, activity, events, featured discussions, learning, members. Discussions, Members, Events, Resources and Learning as listed in the brief (feeds, categories, comments, reactions, attachments, search, sorting, moderation; directory with filters and privacy; registration, attendance, calendar; categories, previews, uploads, permissions; courses, lessons, enrolments, assignments, assessments, grading, feedback, certificates, instructors, TAs, learning analytics).

## Part 11 — Role-based experiences
Member, Owner/Admin (configuration, members, invitations, roles, content, moderation, events, analytics), Moderator (reports, queues, actions, audit history), Instructor (courses, lessons, enrolments, assessments, progress, feedback), Platform Admin (users, communities, **template management**, global settings, permissions, moderation oversight, analytics, **system health**, audit logs). Practical tables, filters, structured forms; no admin actions for unauthorised roles.

## Part 12 — Analytics and maturity
Platform activity, engagement, growth, retention, discussion, event and learning participation, completion, moderation; north-star WMAM (Weekly Meaningfully Active Members); privacy-respecting. Maturity: APIs, performance, reliability, monitoring, backups, security, scalability, optional monetisation. AI only after the core is mature.

## Parts 13–16 — Quality
- Responsive for desktop, laptop, tablet and mobile without shrinking desktop layouts; no horizontal overflow; touch targets; adapted tables, forms and dialogs. WCAG 2.2 AA where practical.
- Preserve auth, authorisation, relationships, routes, business logic, data and working features; no unnecessary rewrites, duplicates, hardcoded AlumniZone or mock functionality; explain any architectural change.
- Test every affected workflow and edge case (duplicate submissions, missing fields, invalid configuration, expired invitations, revoked permissions, inactive templates, template versions, failed publishing and uploads, unauthorised API calls, empty, loading and network states, mobile). Verify one template makes independent communities, AlumniZone is not auto-created, and existing data stays reachable per its permissions.
- No emojis, excess glass, gradients, animation, glow, repeated generic cards, tiny low-contrast text, empty sections, borders everywhere, or placeholder content shown as real.

## Part 17 — After approval
Incremental order: architecture and data validation → design system → landing → auth and onboarding → navigation → Home → discovery → My Communities → overview → discussions → members → events and resources → learning → community settings → admin → responsive → accessibility → functional → security → QA. Progress summaries at milestones; a final report (features, pages, components, architecture, preserved functionality, migration, tests, responsive, accessibility, outstanding issues, deviations).

## Where this differs from earlier approved decisions
- **D3 / R5 (AlumniZone as the default community everyone joins)** is reversed. Affected: `joinDefaultCommunity` and `DEFAULT_COMMUNITY` in `server/lib/community.js`, the seed's merge of All Hands into AlumniZone, the Landing page's AlumniZone section, and the Stage 7 guards that stop AlumniZone being suspended or deleted.
- **Graphite + lime dark theme** is replaced by a light-first theme with a `#168C70` accent. Stage 7's "lime means platform" rule for announcements goes with it.
- **Emoji community logos and emoji icons** (older Admin tools, `Glyph`, community `emoji` field, seed data) must go.
- **New scope:** community templates with questionnaires and versioning, template administration, and system health in Platform Admin.
