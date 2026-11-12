# CommunityOne: final documentation (A to Z)

**One Platform. Every Community.**

This is the closing record of the CommunityOne project. It covers what was built, how it works, how to run and deploy it, how it was tested, what is unfinished, and what anyone picking it up again needs to know. Development stopped on 12 November 2026 at commit `8c325c4`, with the final AppSail bundle built from that commit.

| | |
| --- | --- |
| Repository | `aadhi462-star/easyIntranet-`, branch `main` (local copy: `Desktop/My projects/Game rush/alumnizone`) |
| Status | Finished prototype, pilot quality. Not for real members until the database moves to managed PostgreSQL (§16). |
| Final bundle | `appsail-build.zip` (30 MB) in the repository root, built 12 Nov 2026 from `8c325c4` |
| Size | About 48,500 lines across `server/`, `src/` and `shared/`; 87 commits; 21 database migrations; about 225 API routes |
| Tests | 447 server tests, 12 browser journeys (run on two screen sizes), a 161-screen accessibility and layout audit |

---

## Contents

1. [What CommunityOne is](#1-what-communityone-is)
2. [How it was built: timeline](#2-how-it-was-built-timeline)
3. [Decisions that shaped it](#3-decisions-that-shaped-it)
4. [Features, area by area](#4-features-area-by-area)
5. [Roles, permissions and membership states](#5-roles-permissions-and-membership-states)
6. [Architecture](#6-architecture)
7. [Data model](#7-data-model)
8. [Data migrations and background jobs](#8-data-migrations-and-background-jobs)
9. [API reference](#9-api-reference)
10. [Security model](#10-security-model)
11. [Design system and accessibility](#11-design-system-and-accessibility)
12. [Configuration](#12-configuration)
13. [Testing and quality](#13-testing-and-quality)
14. [Running it locally](#14-running-it-locally)
15. [Deploying to Catalyst AppSail](#15-deploying-to-catalyst-appsail)
16. [Before real members: hosting limits](#16-before-real-members-hosting-limits)
17. [Demo accounts and seed data](#17-demo-accounts-and-seed-data)
18. [Known gaps and open decisions](#18-known-gaps-and-open-decisions)
19. [Rules to keep if work resumes](#19-rules-to-keep-if-work-resumes)
20. [Document map](#20-document-map)
21. [Glossary](#21-glossary)

---

## 1. What CommunityOne is

CommunityOne is a web platform where anyone can create and run online communities: alumni networks, schools and courses, professional groups, technology meet-ups, businesses and customers, hobby groups, organisations and general-interest groups. One account works across every community a person belongs to.

It started as **AlumniZone**, a browser-only prototype of an alumni intranet (React, with all data kept in the browser). Over the project it became a full product with its own server and database. AlumniZone is now just one community inside CommunityOne, with no special status.

**Principles the user set, and the product keeps:**
- Open community. No paid features and no outside integrations.
- Nobody is ever added to a community they didn't choose. Joining is always the person's own action, or their acceptance of an invitation.
- Public, Private and Closed communities, each with clear rules about who can see what.
- Light-first design, with an optional dark mode. No emoji anywhere: icons only.
- Built-in learning (courses, quizzes, assignments, certificates) inside each community.
- Moderation and safety from the start: reports, cases, appeals and sanctions.
- The AI helper is called **Smart Assist**, never "Zia". It is parked for a later phase and is not built.

**The governing briefs** (all in `docs/communityone/`):
- `MASTER_PROMPT.md`: the original product brief (the goal of everything).
- `REDESIGN_BRIEF.md`: the UI/UX redesign brief, approved stage by stage.
- `MASTER_BRIEF_V2.md`: the 12 Nov 2026 brief. It reversed two earlier decisions: AlumniZone is no longer the default community, and the lime theme became the light green palette. It also added templates, a strict no-emoji rule and a full design-system pass.
- The three source documents from the user: a consolidated product conversation, 244 edge cases, and the AlumniZone revamp roadmap (Word files in `~/Downloads`).

---

## 2. How it was built: timeline

All work happened between 5 and 12 November 2026. Each stage was proposed, drawn as boards on a design canvas, approved by the user, built, tested and pushed.

| Date | Stage | What it delivered |
| --- | --- | --- |
| 5 Nov | Prototype | AlumniZone browser-only app; the AI helper renamed Smart Assist. |
| 10 Nov | **Phase 0** | Assessment of the prototype, inventory, migration plan and the 244-case edge-case register. |
| 10 Nov | **Phase 1, steps 1–2** | Server foundation (Fastify + PostgreSQL/PGlite), accounts, sessions, email confirmation, passwords. |
| 10 Nov | Phase 1, step 3 | Profiles, institutions, departments and the alumni directory. |
| 10 Nov | Phase 1, step 4a | Connections and blocks. |
| 10 Nov | Phase 1, step 4b | Communities, memberships, posts; the web app's Feed and Groups moved to the server. |
| 10 Nov | Phase 1, step 4c | Events, RSVPs, recurring series, the member dashboard. |
| 10–11 Nov | Hosting | Catalyst AppSail deployment, Catalyst Mail, a ready-made database for fast starts. |
| 11 Nov | **Redesign Stage 1** | Tokens, outline icons, app shell, CommunityOne branding and logo. |
| 11 Nov | Redesign Stage 2 | Public website and public discovery. |
| 11 Nov | Redesign Stage 3 | Community pages, search, the All Hands merge (R4), onboarding. |
| 11 Nov | **Stage 4** | Files in the database, Resources, Discussions with topics and attachments, notifications, Saved, the event waitlist, reminders and email retries. |
| 12 Nov | **Stage 5a** | Learning: courses, modules, lessons, enrolment, progress, My Learning. |
| 12 Nov | Stage 5b | Quizzes, assignments, grading and certificates with public verification. |
| 12 Nov | **Stage 6** | Community management: reports, moderation cases, appeals, sanctions, deletion requests, analytics. |
| 12 Nov | **Stage 7** | Platform administration: users, communities, moderation centre, settings, roles, announcements, activity log, analytics. |
| 12 Nov | **v2 brief: proposal** | Audit and proposal (`PROPOSAL_V2.md`), about 83 hours estimated across workstreams A–H. Approved with P1–P5. |
| 12 Nov | v2 A | No default community (the P1 migration), feature flags enforced, test-runner stall fixed, Playwright set up. |
| 12 Nov | v2 B | Light-first design tokens, Lucide icons, emoji removed, shared components. |
| 12 Nov | Parallel round | Server work built by parallel agents: templates, invitations, branding and section switches, system health, emoji cleanup, the stall fix. |
| 12 Nov | v2 C | Public website, sign-in screens and welcome steps. |
| 12 Nov | v2 D | Shell, Home, Explore, My Communities, Profile, search. AppSail bundle built. |
| 12 Nov | v2 E | Community pages, branding (logo, cover, accent) and section switches. |
| 12 Nov | v2 F | Creation wizard, templates, template administration, invitations end to end. |
| 12 Nov | v2 G | Community settings (eleven sections), the single moderation queue, Teaching, Platform Admin restyle, System health. |
| 12 Nov | **v2 H** | Final pass: screen audit, accessibility fixes, security review (H-S1 to H-S10), final QA report. |
| 12 Nov | Close | H-S9 file-access fix, final AppSail bundle, this document. |

The detailed record of every step, with what was checked and what was not done, is the progress log in `PHASE0_ASSESSMENT.md` §14 onwards.

---

## 3. Decisions that shaped it

These were approved by the user. Later decisions override earlier ones where they conflict.

**Platform (Phase 1)**
- **D1** Node.js + Fastify + PostgreSQL. PGlite (PostgreSQL in WebAssembly) locally and on AppSail; a real server through `DATABASE_URL`.
- **D2** Parked modules (Tasks, Custom Apps, Web Tabs, Live, Town Halls, Channels, Surveys, Ideas, Leaderboard, Smart Assist and others) sit behind feature flags, off by default.
- **D4** Institutions → departments → batches are first-class data.
- **D5** Email goes through Catalyst Mail on AppSail. Locally it goes to the server log and `/api/dev/outbox`.
- **D6** Super Admin is Sara Thomas.
- **D7** PGlite as the embedded database.
- *(D3, "network-wide content goes to the AlumniZone community", was reversed by the v2 brief.)*

**Stage 4 (engagement)**
- Files are stored in the database, up to 10 MB each.
- Discussions have topics.
- Posts can carry up to 4 attachments (images and PDFs).
- A full event gets a waitlist.
- Notification emails have defaults that members can change.
- There is no malware scanner: only safe file types are accepted. Recorded as a known gap (FIL-04).

**Stage 5 (learning)**
- Owners, Admins and assigned Instructors build courses.
- Lessons are text, files or outside links. A video is a link: there's no video hosting.
- Enrolment is open to members, with optional capacity and a waitlist.
- Leaving the community ends course access. Progress is kept and comes back on rejoin.
- Unpublishing stops new enrolments only. A course with learners can be archived, not deleted.
- Edits after someone completes a course keep their completion.
- Quizzes are multiple choice, with an attempt limit (default 3), best score counted and server-side deadlines.
- Certificates are issued automatically, each with a verification code. The public check page shows only name, course, community, date and code.

**Stages 6 and 7 (management and administration)**: decisions D1–D8 for each, as drawn on the S6Plan and S7Plan boards. The main ones:
- A case's audience is fixed at the first report.
- Reporters are never named in a review.
- Removing and blocking are Admin decisions; Moderators warn and restrict.
- Deleting a community is a reviewed request with a 30-day restore, never instant.
- Fresh-password checks are required for critical actions.

**v2 brief (12 Nov), answers P1–P5**
- **P1** AlumniZone becomes an ordinary community. Only members who took part were kept, and the change was a logged, undoable migration.
- **P2** Dark mode stays as an option.
- **P3** Playwright end-to-end tests were added.
- **P4** Parked modules: routes removed, files kept behind flags.
- **P5** A darker accent is used for text and buttons, so the palette passes WCAG AA.
- **B1–B5, C1–C14, D1–D12, E1–E13, F1–F14, G1–G12**: each workstream's board decisions, approved as drawn. They are listed on the canvas boards and summarised in each progress-log entry.

---

## 4. Features, area by area

### 4.1 Public website (signed out)
- **Landing page** (`/`): search first, live discovery of Public communities filtered in place, product sections, and examples clearly labelled "Example". It shows only real numbers from the API.
- **About, Help, Privacy, Terms, Contact.** Terms and Contact still need the operator's text.
- **Explore** (`/explore`): Public and Private communities, by category and search. Closed communities are never listed.
- **Certificate check** (`/verify/:code`): public. It shows only name, course, community, date and code.

### 4.2 Accounts
- Create an account with email confirmation. A confirmation link that no longer works offers a fresh one.
- Sign in, sign out, and sign out everywhere.
- Forgotten password: a reset by email link, rate limited.
- Change your password or email (both need the current password).
- Account states: unverified, pending approval (when registration needs approval), active, suspended, deactivated (can reactivate with the password), deleted.
- Lockout after repeated wrong passwords. It applies to reactivation too.
- Welcome steps after sign-up. They show communities to join but never join anyone automatically.
- Account data export (API only; there's no button yet).

### 4.3 Profiles and people
- A profile with education (institution, department, graduation year), city, interests and links.
- Privacy controls: list me in member directories (off means you don't appear in Members tabs or people search), plus who sees each part.
- The People directory, with filters by graduation year and department.
- A profile never reveals a Private or Closed membership (VIS-16).
- Connections (request, accept, remove) and blocks. Blocks hide both people from each other everywhere, and a block is never revealed to the blocked person.

### 4.4 Home, Explore, My Communities, search
- **Home:** one featured item, chosen in this order: replies to you, Mandatory Read, connection requests, next event. Then new posts in your communities, coming events, suggestions and the platform announcement bar. First-run Home is for people with no communities yet.
- **Explore:** every community you can join, with categories, sort and "hide ones I'm in".
- **My Communities:** your memberships, invitations and requests.
- **Search:** one box across communities, people, posts and events, with suggestions. "/" focuses it on desktop and opens Search on a phone.
- **Shell:** sidebar on desktop, top bar, and a five-destination bottom bar on phones (Home, Explore, Communities, Notifications, Profile).

### 4.5 Communities
- **Visibility:**
  - *Public:* anyone can see it and join.
  - *Private:* listed; people ask to join and Admins approve.
  - *Closed:* invitation only and never listed. It doesn't exist for outsiders, who get a 404.
- **Community page** (`/c/:slug`): header with logo, cover and accent colour, and section tabs that follow the community's switches.
  - **Overview:** welcome and composer for new members, pinned posts, the discussion list, and the next event with RSVP. Role panels show the Owner's health checklist, the Admin decision queue and the Moderator review queue.
  - **Discussions:** posts, announcements, questions and polls. Includes topics, attachments, reactions, comments with replies, Mandatory Read with acknowledgements, drafts, scheduled posts, pinning, search and sort.
  - **Events:** list and month views, recurring series (time-zone aware), RSVP with capacity and waitlist, co-hosts, comments, reminders, cancellation, event categories.
  - **Resources:** a library of files and links with categories, search and sort.
  - **Members:** directory with search and filters. Moderators also see restricted, removed and blocked members.
  - **Learning:** the course catalogue (see 4.7).
  - **About:** description, guidelines and join questions.
  - **Manage:** for staff (see 4.9).
- **Section switches:** Discussions, Events, Resources and Learning can each be turned off. A switched-off section disappears for members; staff can still read it.
- **Branding:** logo, cover picture and an accent colour. The accent is identity only (cover band, tiles, tab underline, date tiles). Controls keep the platform colour.
- **Joining:**
  - Join (Public).
  - Request to join, with optional join questions (Private).
  - Accept an invitation (Closed).
  - Leave at any time.
- **Ownership:** one Owner per community, transferable to an active member.
- **Archive:** read-only for everyone.
- **Merge:** an old community merged into another (used once for All Hands into AlumniZone). Old links follow it, unless the new home is Closed and you're outside it.
- **Suspension** by platform staff: hidden from members; its own staff can read it but not change it.

### 4.6 Creating a community: wizard and templates
- **Wizard** at `/communities/new`. Start from a template or from scratch, answer the template's questions (or skip them), configure, preview and publish. Nothing is saved before Publish; the server check runs first. The creator becomes Owner.
- **Eight templates:** Alumni, Education, Professional Networking, Technology, Business, Hobbies and Interests, Organisation, General Community. Each has a questionnaire (five question types) that fills in settings, sections, event and resource categories, and roles.
- **Nine categories:** the eight above plus Other. A category review screen for staff re-sorted older communities (D6 migration).
- **Template administration** (Platform Admin → Templates): versions, drafts, publishing, and a check that every rule matches a question. A template is copied into a community at creation and never reaches it again.

### 4.7 Learning (inside each community)
- **Courses** with modules and lessons. Lessons can be text, files or links. Courses have objectives and requirements.
- **Course states:** draft, published, unpublished, archived. A course can be "hidden from the catalogue (link only)".
- **Enrolment:** open to members, with optional capacity and a waitlist. Progress is tracked per lesson, and new lessons show as "New".
- **Quizzes:** multiple choice. Answers are saved as you go, with an attempt limit, best score and server-side deadlines.
- **Assignments:** text and files. Grading has a claim lock, Save draft, Return to learner, and late flags.
- **Certificates:** issued automatically on completion, with a verification code and a public check page.
- **Staff:** Instructors (build and grade) and Teaching Assistants (grade and see learners).
- **Teaching view** (`/c/:slug/learning/teaching`) for course staff.
- **My Learning** (`/learning`): your courses across communities, with certificates.
- A lesson hides the phone bottom bar (focus mode).

### 4.8 Notifications and Saved
- In-app notifications: replies, mentions, connection requests, join decisions, invitations, event reminders, waitlist promotions, moderation notices and announcements. Includes an unread count and mark as read.
- Email notifications, with defaults set by the community and a member's own choice winning. Moderation and account notices are always sent.
- Saved posts and items (`/saved`).

### 4.9 Community management (Manage)
- **Manage overview:** health, counts and what needs attention. On phones, Manage is a list.
- **The single queue:** reports, held posts, join requests, appeals and decided items. A split view on desktop; on phones, a list and then the item with Apply pinned.
- **Moderation:**
  - Members report posts, comments, events and people.
  - Reports become cases, with a snapshot and a history.
  - Staff claim a case, decide it (remove, restore, warn, restrict, remove the member, block) and can escalate it to the platform.
  - Members can appeal a decision.
  - Restrictions expire on their own.
  - Reporters are never named.
- **Members management:** sanctions (warn, restrict for 1, 7 or 30 days, remove, block), lift, and sanction history.
- **Analytics:** members, activity and content over time, with CSV export.
- **Deletion request:** Owners ask; the platform reviews it, with a 30-day restore.
- **Settings, in eleven sections,** each saved on its own with version checks:
  1. General
  2. Branding
  3. Privacy and visibility (with a confirm that shows real counts)
  4. Membership (join questions, approval, "invite people who match")
  5. Roles and permissions
  6. Discussions and content
  7. Learning
  8. Events and resources
  9. Notifications (defaults)
  10. Moderation and safety
  11. Danger Zone (archive, transfer, deletion request)

### 4.10 Platform administration (`/admin`)
Each section shows by permission, not by "is admin".
- **Overview:** totals, what needs attention, recent activity, and a communities table.
- **Users:** search, approve or decline, suspend and reactivate, sign out everywhere, platform roles, CSV export.
- **Communities:** suspend, unsuspend, change owner, members, the deletion review, delete with restore.
- **Category review.**
- **Moderation centre:** escalated cases across communities.
- **Activity log:** the audit trail, with filters and CSV export.
- **Analytics:** platform-wide figures, with CSV export.
- **Settings:** general, registration (open, approval, allowed domains), security (session days, lockout), files (size, types), who can create communities.
- **Roles and permissions:** the platform role matrix.
- **Templates** (see 4.6).
- **Announcements:** a platform-wide bar with audience and end date, which members can dismiss.
- **Institutions:** institutions and departments.
- **System health:** job runs and failures, failed emails with retry, applied migrations, database storage, environment, and a warning when data isn't persistent.
- **Administrative Mode:** platform staff can open any community, including Private and Closed, only when they turn it on explicitly. It is audited, and it never creates a membership.
- Older browser-only admin tools (policies, profile fields, user labels, branding, workflows, schedulers, data export) sit behind the `admin.legacy` flag, which is off.

### 4.11 Parked modules (off by default)
These are kept from the prototype behind feature flags and are not part of the product: Town Halls, Live and Meetings, Forums, Ideas, Channels and Chats, Surveys, Tasks and Boards, Files (replaced by Resources), Manuals, Custom Apps, Web Tabs, Community structure (org chart), Recognition (leaderboard), and Smart Assist. They still run on browser-only data.

---

## 5. Roles, permissions and membership states

### Platform roles
| Role | Can |
| --- | --- |
| Super Admin | Everything, including granting Platform Admin and changing critical security settings. |
| Platform Admin | Users, communities, learning, moderation, platform settings, analytics, audit, announcements, health, templates, institutions; assign non-critical staff roles. |
| User Manager | View, manage, suspend and approve users; institutions. |
| Community Manager | Manage communities and templates. |
| LMS Manager | Learning across the platform. |
| Trust & Safety | Moderation; view and suspend users. |
| Finance Manager | Revenue analytics (unused: no paid features). |
| Support Agent | View users. |

Staff can act only on people whose platform roles they could assign themselves (H-S3). Losing a platform role ends that person's sessions.

### Community roles (highest first)
Owner (one per community) → Admin → Moderator → Instructor / Teaching Assistant → Member. Nobody can give a role equal to or above their own, or act on someone at or above it. The Owner role moves only through a transfer.

### Membership states
| State | Meaning |
| --- | --- |
| active | A member. |
| restricted | Can read, can't post or comment, until the restriction ends. |
| pending | Asked to join a Private community. |
| invited | Invited (Closed communities use invitations). |
| left | Left on their own; can join or ask again. |
| removed | Removed by an Admin; can ask again after a lift. |
| blocked | Blocked by an Admin; the community no longer exists for them. |

All community permissions come from one function, `access()` in `server/lib/community.js`. It checks, in order: account, community status, visibility, membership state, role, then community settings.

---

## 6. Architecture

**Stack:**
- React 18
- Vite 6
- Tailwind 4
- Lucide icons
- Node.js (24 recommended; Node 23 had a startup deadlock, worked around)
- Fastify
- PostgreSQL (PGlite locally)
- Playwright for browser tests

**One service** serves the API on `/api` and the built web app on every other path, with same-origin cookies.

```
alumnizone/
├── server/
│   ├── app.js            buildApp: helmet CSP, cookies, rate limits, error handler, strict schemas
│   ├── index.js          start: database, seed, routes, the one-minute job runner
│   ├── db/               PGlite or PostgreSQL connection, migration runner
│   ├── migrations/       001–021 SQL migrations
│   ├── lib/              shared server logic (below)
│   ├── routes/           23 route files (§9)
│   ├── seed/             prototype.json (34 people, AlumniZone + 8 groups, posts, events)
│   ├── scripts/          seed, export-prototype, undo-merge, undo-data-migration
│   └── test/             26 test files (§13)
├── shared/recurrence.js  time-zone-aware event series, used by server and app
├── src/
│   ├── App.jsx           routes; Protected gate; public pages
│   ├── pages/            44 pages (product pages plus parked modules)
│   ├── components/       by area: shell, public, auth, feed, groups, events, learning, manage,
│   │                     settings, queue, teaching, invitations, create, platform, profile, ui …
│   ├── lib/              api.js (CSRF, idempotency), communities, feed, events, learning,
│   │                     manage, platform, theme, modules (route + flag table) …
│   └── styles/index.css  design tokens and component classes
├── e2e/                  Playwright journeys and the screen audit
├── scripts/              appsail-bundle.sh, build-db-template.mjs
└── docs/communityone/    every brief, plan, log and report
```

**Server library (`server/lib/`):**
- `session.js`: hashed HttpOnly sessions, CSRF, idempotency keys, fresh-password checks.
- `permissions.js`: platform roles.
- `community.js`: `access()`, sections, accents, branding URLs.
- `relations.js`: connections and blocks.
- `settings.js`: versioned, allow-listed platform settings.
- `audit.js`: the audit log.
- `mailer.js`: outbox and Catalyst transport.
- `notify.js`: notifications and email preferences.
- `files.js`, `images.js`: file store, type detection, image sizes.
- `templates.js`, `template-library.js`: templates.
- `categories.js`
- `merge.js`: the community merge.
- `data-migrations.js`: logged, undoable data changes.
- `jobs.js`: the background job runner.
- `crypto.js`: scrypt passwords and ids.
- `errors.js`

**Client bridge pattern:** the server is the authority. `AuthSync` checks the session and syncs the directory and communities into the older local store, which the parked modules still read. Product screens read the server directly.

---

## 7. Data model

Migrations are in `server/migrations/` and run in order at start.

| Migration | Adds |
| --- | --- |
| 001 foundation | users, sessions, tokens, platform roles, audit log, settings, email outbox, feature flags |
| 002 profiles | profiles, institutions, departments, education |
| 003 connections | connections, blocks |
| 004 communities | communities, memberships, posts, comments, reactions, polls |
| 005 events | events, co-hosts, invitees, RSVPs (with deadline), event comments |
| 006 core | merges (R4), core indexes |
| 007 accents | a stored accent per community |
| 008 engagement | files, resources, post attachments, topics, notifications, saved items, waitlist |
| 009 learning | courses, instructors, modules, lessons, enrolments, progress |
| 010 assessment | questions, attempts, assignments, submissions, certificates |
| 011 moderation | moderation cases, reports, case events, sanctions, appeals, deletion requests; removed_at on content |
| 012 platform | platform deletion and restore, announcements, staff actions |
| 013 data migrations | migration_log (once, logged, undoable) |
| 014 module flags | feature flags for the parked modules |
| 015 templates | templates and versions, the nine categories |
| 016 invitations | invitations for Closed communities |
| 017 branding | logo and cover files, enabled sections |
| 018 health | job_runs |
| 019 event categories | event categories |
| 020 teaching | Teaching Assistants on courses |
| 021 admin legacy flag | the `admin.legacy` flag |

**Rules built into the data:**
- One Owner per community (`memberships_one_owner`).
- A merged community keeps its memberships for undo, so every "my communities" query must exclude `merged_into`.
- A deleted community has `status = 'deleted'`; lists exclude it, and it can be restored for 30 days.
- Files live in the database, as bytes, with a SHA-256 and a detected type.

---

## 8. Data migrations and background jobs

**Data migrations** (`server/lib/data-migrations.js`). Each runs once, is logged row by row, and can be undone with `server/scripts/undo-data-migration.mjs`:
- `p1-alumnizone-ordinary`: AlumniZone becomes an ordinary community, keeping only members who took part.
- `d6-categories`: older communities moved onto the nine categories, after a review.
- `e2-sections`: enabled sections written to `settings.sections`. It runs at every start.
- `f12-question-types`: stored questionnaires moved to the five question types.
- `g2-retire-membership-rules`: automatic membership rules switched off. Nobody was removed.

**Background jobs** run every minute from `server/index.js` (`server/lib/jobs.js`), and each run is recorded in `job_runs` (kept 14 days):
- `posts`: publish scheduled posts when they're due.
- `reminders`: event reminders.
- `emails`: retry failed emails, up to 3 attempts.
- `waitlists`: give a freed place to the next person on the waitlist.
- `restrictions`: lift restrictions that have ended.
- `purge`: remove communities deleted more than 30 days ago.
- `stale-reports`: remind staff about reports left too long.

---

## 9. API reference

All routes are under `/api`. Every non-GET request needs the CSRF header (`x-csrf-token` matching the `c1_csrf` cookie). Retried creates can send `Idempotency-Key`.

| Area (file) | Routes |
| --- | --- |
| Accounts (`auth.js`, 18) | register, verify, verify/resend, login, reactivate, logout, logout-all, session, me, registration, password forgot/reset/change, email change/confirm, account onboarded/deactivate/delete |
| Profiles (`profiles.js`, 11) | institutions, directory and facets, profiles/:id (+ communities, posts), PATCH profiles/me, account export, admin institutions and departments |
| Connections (`connections.js`, 8) | list, one relation, connect, remove; blocks list, block, unblock |
| Communities (`communities.js`, 16) | list, one, members, join, leave, requests, health, member role/state, transfer, validate, create, visibility-impact, PATCH, archive, DELETE (answers 410: deletion is a reviewed request) |
| Branding (`branding.js`) | PATCH branding; logo and cover images |
| Invitations (`invitations.js`, 12) | invite, add members (as invitations), invite-matching, list, revoke, resend, my invitations, open by token, accept, decline |
| Posts (`posts.js`, 15) | feed, one post, create, edit, publish, approve, remove, pin, delete, reactions, vote, acknowledge, comments |
| Topics (`topics.js`, 4) | list, create, edit, delete |
| Events (`events.js`, 10) | list, one, create, edit, cancel, delete, RSVP, cancel RSVP, comments |
| Resources and files (`resources.js`, 6) | upload, download, library list, add, edit, delete |
| Notifications (`notifications.js`, 9) | list, unread count, mark read, preferences, saved items |
| Learning (`learning.js`, 22) | courses, instructors, modules, lessons, order, enrol, lesson view, complete, learners, teaching, my learning |
| Assessment (`assessment.js`, 14) | questions, attempts, submissions, grading (claim, draft, return), my certificates, certificate check |
| Moderation (`moderation.js`, 14) | reports, cases (claim, decide, restore, escalate, appeal), appeals, member sanctions, lift, history |
| Manage (`manage.js`, 5) | deletion request, analytics and CSV |
| Templates (`templates.js`, 10) | public list and one, suggest; admin list, version, create, edit, publish |
| Search (`search.js`) | one search across communities, people, posts and events |
| Dashboard (`dashboard.js`) | Home's data |
| Public (`public.js`) | signed-out discovery |
| Admin (`admin.js`, 14) | users (list, one, CSV, suspend, reactivate, approve, decline, roles, sign out), settings, overview, audit, my permissions |
| Platform (`platform.js`, 29) | confirm-password, communities (suspend, owner, members, delete, restore), category review, deletion review, moderation centre, waiting counts, settings, features, roles, announcements, activity and CSV, analytics and CSV |
| Health (`health.js`) | system health, email retry |
| Dev (`dev.js`) | `/api/dev/outbox`, development only (not registered in production) |

---

## 10. Security model

- **Sessions:**
  - Random tokens, stored hashed, in HttpOnly SameSite=Lax cookies (Secure in production).
  - Account status and roles are re-read on every request.
  - Sessions end on suspension, deactivation, deletion, password reset, role loss, and password change (other sessions).
- **CSRF:** a double-submit token on every non-GET request.
- **Passwords:** scrypt hashing, a lockout after repeated failures, and fresh-password checks for critical admin actions.
- **Authorization:** every route checks permissions on the server; nothing relies on hidden buttons. Community rules come from `access()`. Administrative Mode needs `communities.manage` plus an explicit header, and every use is audited.
- **Input:** strict JSON schemas. Unknown fields are refused, not dropped. SQL is parameterised; every dynamic fragment comes from an allow-list.
- **Files:**
  - The type is decided from the bytes; SVG and HTML are refused.
  - Size is capped.
  - Downloads are sent as attachments with `nosniff` and a sandbox CSP; only images can be shown inline.
  - A file is readable only by people who can see what it's attached to (H-S9).
- **Rate limits** on sign-in, sign-up, reset, verification, invitation tokens, certificate lookups, public pages and password confirmation. The server trusts one proxy hop (`TRUST_PROXY_HOPS`), so clients can't fake their IP.
- **Privacy:**
  - Profiles never reveal Private or Closed memberships.
  - Blocks are never revealed.
  - Directory opt-outs are respected in Members.
  - Merged links don't reveal a Closed new home.
  - Reporters are never named.
- **Audit log:** sign-ins, failures, admin actions, Administrative Mode, exports, moderation and data migrations. CSV exports guard against formula injection.
- **Production:** the `/api/dev/*` routes are off, `RATE_LIMITS=off` is ignored, and `APP_ORIGIN` is required, so email links never come from the request's Host header.
- **Final review:** findings H-S1 to H-S10 (`QA_REPORT.md` §3). All are fixed except part of H-S7 (account enumeration), which is a decision.

---

## 11. Design system and accessibility

- **Palette (light first):**
  - Page `#F7F8F6`, surface `#FFFFFF`, text `#17211F`, secondary text `#5F6B66`.
  - Accent `#168C70` for focus rings and graphics; `#127A61` for links and buttons.
  - `#0F6B55` for accent text on the accent tint.
  - A matching dark mode, chosen per viewer (light, dark or system).
- **Tokens:**
  - Semantic `--az-*` variables in `src/styles/index.css`: surfaces, text levels, controls, focus, link, fill, status colours, on-tint.
  - Community accents (`--cm-*`) are identity only.
  - A source test fails if the stock Tailwind white, slate, rose, emerald, amber or orange palettes come back.
- **Components:**
  - `components/ui` (Controls, Confirm): buttons, fields, switches, tabs.
  - `confirmAction()`, never the browser's `confirm()`.
  - `Modal`, which keeps focus inside, closes on Escape and returns focus to the opener.
- **Icons:** Lucide via `<Icon name>`. No emoji anywhere; a test enforces it.
- **Type:** a display face for headings and a scale of `.t-display`, `.t-h1`–`.t-h3`, `.t-body`, `.t-small`, `.t-label`. Buttons are 44 px.
- **Logo:** the user's artwork redrawn as SVG (`LogoMark`, `Logo` in `components/ui.jsx`), with an app icon in `public/favicon.svg`.
- **Accessibility, WCAG 2.2 AA:**
  - Final audit: 161 screens at 375, 768 and 1280 px plus dark mode, with 0 findings.
  - Checked: no sideways scrolling, 24 px targets, contrast, accessible names from the browser's accessibility tree, heading order, landmarks, unique ids, visible focus.
  - Also in place: a Skip to content link and reduced-motion support.
- **Responsive:**
  - Phone layouts are designed, not shrunk: a bottom bar, Manage and Administration as lists, tables as cards, a pinned Apply in the queue.
  - The course builder is desktop only.

---

## 12. Configuration

**Environment variables**
| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `production` on AppSail; `test` for the test runner |
| `PORT`, `HOST`, `X_ZOHO_CATALYST_LISTEN_PORT` | Listening address. AppSail sets its port variable; the server binds 0.0.0.0. |
| `APP_ORIGIN` | The public URL. **Required in production**; email links use it. |
| `SEED_PASSWORD` | The password for every seeded account on AppSail. Without it nothing is seeded or unlocked. |
| `DATABASE_URL` | A real PostgreSQL server. Without it, PGlite is used. |
| `PGLITE_DIR` | The PGlite data folder |
| `SEED_ON_START` | Seed in-process at start (used by the browser tests) |
| `MAIL_TRANSPORT`, `MAIL_FROM`, `MAIL_FROM_NAME` | `catalyst` sends through Catalyst Mail from a verified sender |
| `TRUST_PROXY_HOPS` | Proxies to trust for the visitor's IP (default 1) |
| `RATE_LIMITS` | `off` disables limits in development only |
| `REPORTING_TZ` | Time zone for analytics days |
| `STATIC_DIR`, `LOG_LEVEL` | Built app folder; log level |
| `AUDIT`, `AUDIT_STRICT`, `E2E_PORT` | Screen audit and browser-test switches |

**Platform settings** (Administration → Settings; versioned, audited):
- `general`: name, tagline.
- `registration`: open, require approval, allowed domains.
- `security`: session days, failed sign-ins before lockout, lock minutes.
- `files`: maximum size (5 or 10 MB), allowed types.
- `communities`: who can create communities.

**Feature flags** (Administration → Settings → Features; all off): `module.townhalls`, `module.live`, `module.forums`, `module.ideas`, `module.channels`, `module.surveys`, `module.tasks`, `module.files`, `module.manuals`, `module.apps`, `module.webtabs`, `module.orgchart`, `module.leaderboard`, `module.assist`, `admin.legacy`.

---

## 13. Testing and quality

| Suite | Command | Result at close |
| --- | --- | --- |
| Server tests (node:test, in-memory PGlite) | `npm run test:server` | **447 of 447 pass** |
| Browser journeys (Playwright, installed Chrome, desktop and phone) | `npm run test:e2e` | 23 pass and 1 skipped on a quiet machine. On a heavily loaded machine, one journey timed out per run (a different one each time), and each passes on its own. |
| Screen audit (4 roles × 3 widths + dark mode) | `npm run test:audit` | **161 screens, 0 findings** |
| Source rules (no emoji, no `confirm()`, no stock palettes) | part of the server tests | pass |

**Server test files** (tests per file):
- auth 24, admin 12, profiles 15, profiles-v2 15, connections 11
- communities 39, core 19, discovery 15, events 24, stage4 26
- learning 13, assessment 20, moderation 20, platform 24, public 6, search-v2 9
- templates 25, invitations 35, branding 27, e-sections 14, category-review 5
- g-management 14, health 13, mailer 5, h-security 14, source-rules 3

Test names carry their edge-case ids (for example `REG-02`, `MEM-08`, `H-S1`).

**Browser journeys** (`e2e/`):
- Sign up and confirm, with no default community.
- Join a Public community and post.
- The app is light by default and has no emoji.
- An admin deletes and restores a community.
- The landing page and live discovery.
- Join from a card.
- An expired confirmation link.
- First-run Home and joining from Explore.
- The phone bottom bar and redirects.
- "/" search.
- Create a community from scratch, and from a template.

**Edge-case register** (`EDGE_CASE_REGISTER.md`, 244 cases from the user's document):
- 187 Pass (179 tested plus 8 by design).
- 1 accepted gap: no malware scanner (FIL-04).
- About 59 Not run. These are mostly cases for parked or later-phase features, or ones that need a real email or hosting environment.

**Final QA report:** `QA_REPORT.md`.

---

## 14. Running it locally

```bash
npm install
npm run db:seed            # migrations + idempotent seed from server/seed/prototype.json
npm run build && npm run server   # http://localhost:5181 (API + built app)
```

Other commands:
- `npm run dev`: Vite development server.
- `npm run test:server`, `npm run test:e2e`, `npm run test:audit`.
- `node server/scripts/undo-merge.mjs`
- `node server/scripts/undo-data-migration.mjs <id>`

Notes:
- PGlite is single-process. Stop the server before re-seeding its data folder (`lsof -i :<port>`).
- Use Node 24. Node 23 had a deadlock while PGlite started; `createDb` works around it.
- When the Claude preview couldn't run from the Desktop folder, a copy in a scratch folder was used. HANDOFF.md has the steps.

---

## 15. Deploying to Catalyst AppSail

**The final bundle:** `appsail-build.zip` (30 MB) in the repository root, built on 12 Nov 2026 from commit `8c325c4` with `npm run build:appsail`.
- It contains the server, shared code, the built app, production dependencies only, and migrations 001–021.
- It also contains a ready-made database: migrated, seeded, 34 accounts locked until `SEED_PASSWORD` unlocks them, and vacuumed so no password hash remains.
- Seed counts: 34 people, AlumniZone and the prototype's groups, posts and reactions, 8 events with 13 RSVPs, and the All Hands merge applied.

**Service settings:**
- Catalyst-Managed Runtime, Node 24.
- Startup command `npm start` (`node server/index.js`).
- Default port.
- **2048 MB memory, 1 instance.** 1024 MB should fit (peak about 0.77 GB) but is untested; 512 MB was killed.

**Environment variables:**
- `NODE_ENV=production`
- `SEED_PASSWORD` (secret)
- `APP_ORIGIN` (the service URL)
- `MAIL_TRANSPORT=catalyst`
- `MAIL_FROM` (a verified sender)
- optionally `MAIL_FROM_NAME`

No new variables are needed for this bundle.

**To deploy:**
1. Catalyst Console → AppSail → the CommunityOne service → upload `appsail-build.zip`.
2. Wait for it to start. On a first start with no database, the server moves the bundled database into place and unlocks the seeded accounts.
3. Sign in as Sara Thomas (`sara@example.com`) with `SEED_PASSWORD`.
4. Administration → Category review: check the list and apply it.
5. Administration → Activity log: confirm it shows real visitor IP addresses. If every entry shows the same address, set `TRUST_PROXY_HOPS=2` and restart; otherwise everyone shares one sign-in limit.
6. Check Home, a community page and Explore at phone width.

**Important:**
- Each upload replaces the app folder, so the live database starts again from the bundled one. Accounts and content created on the live site since the last upload are lost.
- The previous live bundle was from after workstream D. This one adds workstreams E–H and every security fix.

---

## 16. Before real members: hosting limits

- **Data isn't durable on AppSail as configured.** PGlite keeps its files in the app folder, and that folder was wiped on every redeploy. Persistence across restarts is unconfirmed. System health shows a `data_not_persistent` warning in production.
- **The fix:** a managed PostgreSQL, set through `DATABASE_URL`. The code already supports it, and it would also cut memory to about 256–512 MB. The cost and choice of provider are the operator's.
- **Still needed from the operator:** the Terms of Service text and a contact address.
- **Email:** Catalyst Mail needs a verified sender and SMTP set up in the console. Failed emails stay in the outbox with their error, and staff can retry them from System health.

---

## 17. Demo accounts and seed data

The seed (`server/seed/prototype.json`) is the original prototype's data: 34 people; the AlumniZone community; 8 prototype groups (Class of 2016, Bengaluru Chapter, Founders Circle, Mentorship Program, Mumbai Chapter, Homecoming 2026 Committee, Computer Science Alumni, and All Hands, which the seed merges into AlumniZone); posts and events.

| Who | Email | Local password | Role |
| --- | --- | --- | --- |
| Sara Thomas | sara@example.com | Community-Demo-2026 | Super Admin + Platform Admin |
| Aisha Raman | aisha@example.com | Community-Demo-2026 | Platform Admin |
| Neha Kapoor | neha.host@example.com | Lime-Host-4821 | Community host (Platform Admin) |
| Arjun Nair | arjun.host@example.com | Lime-Host-7356 | Community host (Platform Admin) |
| Ishita Verma | ishita@example.com | Alumni-Member-2093 | Member |
| Everyone else | (see DEMO_ACCOUNTS.md) | Community-Demo-2026 | Members |

**On AppSail every seeded account uses `SEED_PASSWORD` instead.** These are development values; never use them for real people.

---

## 18. Known gaps and open decisions

**Open decisions:**
1. **Account enumeration (rest of H-S7).** Sign-up says an email is already registered, and the lockout message shows before the password is checked. Recommendation: before real members, always answer "Check your email" and email the owner.
2. **Announcements when Discussions is off.** Announcements are posts, so they're off too. Recommendation: a separate switch.
3. **Category required on the server** (today, a missing category becomes Other). Recommendation: require it.
4. **Blocked-invite message.** `CANNOT_INVITE` tells an Admin there's a block. Recommendation: a neutral message.
5. **Creating from an older template version**, and **resend behaviour and the invitee list**: product questions left open.
6. **`version.json`** isn't written into the bundle, so System health shows 0.1.0 with no commit.

**Not built, or partly built:**
- **Templates:**
  - You can't discard a template draft or delete a template.
  - Stored template settings (apps, resource and event defaults, roles) are saved but not yet used by the forms.
  - The seed's demo communities don't record a template.
- **Members:**
  - "Roles in use" can be edited, but nothing reads it.
  - Explore's Request to join doesn't ask the join questions; the community page does.
  - Signing up from an invitation needs registration to be open.
  - The daily invitation limit isn't atomic.
- **Branding and files:**
  - Replaced logos and refused uploads stay in the file store.
  - No upload progress, and JPEG rotation is ignored.
  - No malware scanning (FIL-04).
- **Jobs:**
  - Reminders and scheduled posts still run for a switched-off section.
  - Job runs can overlap if one takes over a minute.
- **Profiles and Home:**
  - Custom profile fields aren't shown.
  - Some dates in the designs aren't sent by the server.
  - There are no per-community unread counts.
  - The account export has no button.
- **Learning:**
  - No lesson questions, choosing existing files, rich-text toolbar or drag to reorder.
  - No certificate revoke, rubrics or deadline grace.
  - The certificate PDF is the browser's print.
- **Not built at all:**
  - No two-factor sign-in, no profile photos.
  - No Smart Assist (parked).
  - The parked modules still run on browser-only data.
- **Not verified:**
  - A real screen-reader walkthrough.
  - A Community Moderator account in the audit.
  - Administrative Mode in the new settings screens.
  - Screens behind forms in the audit.
  - The parked modules in a browser.
  - Retry on a failed email, live.
  - The `data_not_persistent` warning, live.
  - The password-reset link in a browser test.
  - The AppSail proxy hop count.

---

## 19. Rules to keep if work resumes

- **Never add anyone to a community they didn't choose.** Adding people sends invitations.
- **Community permissions come only from `access()`.** Write routes call `requireChangeable(a)`, so suspended communities stay read-only. Inside `db.tx(...)`, use only the transaction handle (PGlite deadlocks on the outer one). Check permissions before opening a transaction.
- **Community queries:**
  - Exclude `merged_into`, `status = 'deleted'`, and suspended communities where they shouldn't appear.
  - Include `c.accent` and the branding columns when returning communities.
- **The member-state route** changes only current members, and removing and blocking need an Admin.
- **Platform staff** act only on people whose roles they could assign.
- **File access:** a new kind of file attachment needs a branch in `canRead` (`routes/resources.js`). Otherwise its files will only open for the uploader.
- **Data changes** go through `lib/data-migrations.js`: once, logged, undoable.
- **Feature flags:** new parked pages get a `flag` in `src/lib/modules.js`.
- **Design:**
  - Use the `--az-*` tokens and `components/ui`; accent text on a tint uses `--az-on-tint`.
  - Short text links use `.link` or `.hit` (24 px targets).
  - No emoji (`<Icon name>`), and `confirmAction()` instead of `confirm()`.
- **Community accents** are identity only; controls stay the platform colour.
- **Settings:** each settings section saves only its own fields, with the version. Nothing deletes a community at once.
- **Administration** shows by permission, never by "is admin".
- **Public pages** show only real numbers, and product pictures are labelled Example.
- **Emails** pass between pages in router state, never in the address.
- **Tests:** browser tests run with `RATE_LIMITS=off` (development only). Server test names carry edge-case ids.
- **Workflow:** server + migration + seed → tests named by edge-case id → client → browser checks at 375 px, double clicks and two tabs → register and progress log → commit.

---

## 20. Document map

Everything is in `docs/communityone/` unless noted.

| Document | What it holds |
| --- | --- |
| **FINAL_DOCUMENTATION.md** | This document: the A–Z record. |
| `HANDOFF.md` | Session-to-session handoff: run commands, preview quirks, hosting, architecture notes, the rules per workstream. |
| `MASTER_PROMPT.md` | The original product brief. |
| `REDESIGN_BRIEF.md` | The UI/UX redesign brief. |
| `MASTER_BRIEF_V2.md` | The 12 Nov brief (no default community, new palette, templates, no emoji). |
| `PROPOSAL_V2.md` | The v2 audit, proposal, P1–P5 and the estimate per workstream. |
| `PHASE0_ASSESSMENT.md` | Phase 0 assessment, decisions (§10), plan (§11), and the full progress log (§14) for every stage and workstream. |
| `EDGE_CASE_REGISTER.md` | The 244 edge cases with status and evidence. |
| `QA_REPORT.md` | The final QA report: audit method and results, accessibility fixes, the security review (H-S1 to H-S10), decisions, what wasn't checked. |
| `DEMO_ACCOUNTS.md` (repo root) | Demo sign-ins. |
| Design canvas | Boards for every stage and workstream (Refined designs, Stages 4–7, v2 Design system, v2 C–G). |

---

## 21. Glossary

- **Administrative Mode:** platform staff opening a community they aren't in, explicitly and audited.
- **Case:** a moderation item made from one or more reports about the same thing.
- **Closed community:** invitation only; invisible to outsiders.
- **Data migration:** a one-time, logged, undoable change to stored data (as opposed to a schema migration).
- **Mandatory Read:** a post members must acknowledge, with an optional deadline.
- **Parked module:** a prototype feature kept behind an off flag.
- **PGlite:** PostgreSQL compiled to WebAssembly, running inside the Node process.
- **Section switch:** turning a community's Discussions, Events, Resources or Learning on or off.
- **Smart Assist:** the planned AI helper (parked).
- **Template:** a starting point for a new community: questions plus the settings they fill in; versioned.
- **WCAG 2.2 AA:** the accessibility standard the product was audited against.
