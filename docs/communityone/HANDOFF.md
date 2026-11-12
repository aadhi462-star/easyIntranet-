# CommunityOne — Session handoff (12 Nov 2026, after v2 workstream E)

Read this first in a new session, then **`docs/communityone/MASTER_BRIEF_V2.md` (the user's newest brief, 12 Nov 2026: it reverses AlumniZone-as-default and the lime theme; a proposal + ETA is owed before any work on it)**, then **`docs/communityone/MASTER_PROMPT.md` (the user's governing brief — the goal of all of this)** and **`docs/communityone/REDESIGN_BRIEF.md` (the UI/UX redesign brief: experience, brand, screen structure; approval before each stage)**, then `docs/communityone/PHASE0_ASSESSMENT.md` (§10 decisions, §11 plan, §14 progress log) and `docs/communityone/EDGE_CASE_REGISTER.md`.

## What this project is

- Repo: `/Users/jaswa-zsbch1582/Desktop/My projects/Game rush/alumnizone` (GitHub: `aadhi462-star/easyIntranet-`, branch `main`).
- Transforming the AlumniZone prototype (React 18 + Vite 6 + Tailwind 4, browser-only data) into **CommunityOne — "One Platform. Every Community."** per the user's master prompt and three docs (`~/Downloads/Community_Platform_Conversation_Consolidated.docx`, `…Comprehensive_Edge_Cases.docx` (244 cases), `Alumni_Zone_Revamp_Product_Roadmap.docx`). Text copies: `/private/tmp/claude-502/-Users-jaswa-zsbch1582-Desktop-My-projects-Game-rush/6469d2af-edfc-488e-8a21-3b3982a1aa17/scratchpad/refdocs/` (may be gone in a new session — re-extract with `textutil -convert txt`).
- User preferences: open community, no paid features, no external integrations; graphite + lime theme with light/dark; "Smart Assist" (never "Zia"); AI only in Phase 5; push to GitHub only when the user says so (they've said "Push" after each step so far).

## Decisions (approved)

D1 Node.js + Fastify + **PostgreSQL** (PGlite locally, `DATABASE_URL` for a real server) · D2 park Tasks/Custom Apps/Web Tabs/Live/Town Halls/Channels/Surveys/Ideas/Leaderboard/Smart Assist behind flags (flags exist in DB `feature_flags`, **not yet read by the client**) · D3 network-wide content → public community `alumnizone` · D4 institutions → departments → batches are first-class · D6 Super Admin = Sara Thomas (`u7`) · D7 PGlite. D5 (email) → Catalyst Mail on AppSail (`MAIL_TRANSPORT=catalyst`); locally emails still go to the server log + `/api/dev/outbox`.

**Stage 4 decisions, approved by the user on 11 Nov 2026:**
- **S4-1:** files are stored in the database, up to 10 MB each.
- **S4-2:** Discussions have topics.
- **S4-3:** posts can carry attachments: images and PDFs, up to 4 per post.
- **S4-4:** a full event gets a waitlist.
- **S4-5:** notification emails have default settings members can change.
- **S4-6:** there's no malware scanner. Only safe file types are allowed, and that's recorded as a known gap (FIL-04).

**Stage 5 decisions, approved by the user on 11 Nov 2026** (by asking to start building Stage 5):
- **D1:** Owners and Admins build courses, plus members they assign as Instructor for one course (LMS-14).
- **D2:** lessons are text, files from the Stage 4 store and outside links. There's no video hosting; a video is a link.
- **D3:** enrolment is open to members, with an optional capacity and the events-style waitlist.
- **D4:** leaving the community ends course access; progress is kept and comes back on rejoin (LMS-09).
- **D5:** Unpublish stops new enrolments only. A course with learners can only be archived, not deleted (LMS-01/03).
- **D6:** edits after someone completes a course keep their completion. New lessons show as "New" and aren't required for them (LMS-04).
- **D7 (5b):** multiple-choice quizzes with an attempt limit (default 3), best score, server-side deadlines.
- **D8 (5b):** certificates are issued automatically, each with a verification code. The check page shows only name, course, community, date and code.
- **Extra rules on the boards, adopted:**
  - courses can be "Hidden from the catalogue (link only)"
  - there's no course builder on phones in 5a
  - grading has Save draft and Return to learner
  - quiz answers are saved as you go

## Run / test

```bash
npm install
npm run db:seed        # migrations + idempotent seed from server/seed/prototype.json
npm run build && npm run server   # http://localhost:5181 (API + built app)
npm run test:server    # node:test, in-memory PGlite — 120 tests, all pass at last commit
```

Demo logins: `DEMO_ACCOUNTS.md` (most: `Community-Demo-2026`; hosts `neha.host@example.com` / `Lime-Host-4821`; member `ishita@example.com` / `Alumni-Member-2093`; test signup `riya.menon@example.com` / `riya-new-pass-1` exists only in the preview DB).

### Preview quirk (important)
Processes can't run with cwd on the Desktop (EPERM) for the preview, so it runs a **copy** in a scratchpad:
- Step 4c used launch entry `communityone-4c` (port **5182**) in `/Users/jaswa-zsbch1582/Desktop/My projects/Portfolio website/.claude/launch.json` (the session ran from the Portfolio folder). Copy dir: `/private/tmp/claude-502/-Users-jaswa-zsbch1582--claude-spares-spare-vrVP81/0a437b1a-9ae4-4e1e-af5f-acac9d7c2b37/scratchpad/run/communityone` (fresh DB, seeded in 4c; no `riya.menon` test signup).
- The older entry `communityone` (port 5181) in `Game rush/.claude/launch.json` points at the 4b copy. **Its server was left running from an earlier session and its DB was migrated+seeded underneath it in 4c — treat that DB as suspect**: stop it, then re-seed with `--reset` or discard it.
- A new session gets a new scratchpad — recreate: `rsync -a --exclude .data server shared package.json node_modules <copy>/` + `rsync -a dist/ <copy>/dist/`, then `PGLITE_DIR=<copy>/data node server/scripts/seed.mjs`, and update launch.json. **`shared/` must be copied too** (server imports `shared/recurrence.js`).
- Deploy: `npx vite build` → `rsync -a --delete --exclude .data server $R/` + `rsync -a --delete shared $R/` + `rsync -a dist/ $R/dist/`.
- **Rules: check `lsof -i :<port>` and stop the preview server before running seed/migrations on its PGlite dir** (PGlite is single-process; preview_list only shows this session's servers).

## Hosting — Catalyst AppSail (live since 10 Nov 2026)

One AppSail service serves the API and the built web app (no Slate; keeps the same-origin cookie/CSRF model).
- Build: `npm run build:appsail` → `appsail-build.zip` (git-ignored). Upload from Console.
- Settings: Catalyst-Managed Runtime, Node24, startup command `npm start` (= `node server/index.js`; seeds in-process), port default (server reads `X_ZOHO_CATALYST_LISTEN_PORT`, binds 0.0.0.0), **memory 2048 MB**, **1 instance**.
- Env: `NODE_ENV=production`, `SEED_PASSWORD` (secret; all seeded accounts use it — the DEMO_ACCOUNTS.md passwords don't work there; without it nothing is seeded), `APP_ORIGIN` (the service URL, required in production: email links use it, never the Host header), `MAIL_TRANSPORT=catalyst` + `MAIL_FROM` (a sender verified in Catalyst Mail; SMTP configured in the console) + optional `MAIL_FROM_NAME`.
- Email (D5 → Catalyst Mail): `server/lib/mailer.js` `catalystTransport` initialises `zcatalyst-sdk-node` 3.4.0 with the request headers, admin scope; every send is in `email_outbox` (failed ones keep `last_error`, the request still succeeds).
- Fast first start: the bundle ships `server/db-template` (built by `scripts/build-db-template.mjs`: migrated + seeded, every account locked with `LOCKED_HASH`, table vacuumed so no hash remains). On a deploy with no database the server *moves* it into place and unlocks the seeded accounts with `SEED_PASSWORD`. Measured per step: creating a database ≈3 s and seeding ≈2 s are gone; first-start peak memory ≈0.77 GB (was ≈1.36 GB).
- Memory: 2048 MB is safe; 1024 MB should now fit (peak ≈0.77 GB) but isn't tested on AppSail. 512 MB was `Killed`.
- Observed: each redeploy started with an empty database (accounts created before it were gone), so the app folder is not persistent.
- **Latest bundle: 12 Nov 2026, after v2 workstream D (commit 7513362).** `appsail-build.zip` (29 MB) in the repo root, built with `npm run build:appsail`. It includes migrations 001–018 and the database template (34 seeded accounts, locked until `SEED_PASSWORD` unlocks them). The user asked for this bundle after D; see the memory note: build one only when asked.
  - To deploy: Catalyst Console → AppSail → the CommunityOne service → upload `appsail-build.zip`. The settings and env above stay the same; no new variables.
  - The upload replaces the app folder, so the live database starts again from the bundled template. Accounts and content created on the live site since the last upload are lost.
  - After the upload: sign in as a Platform Admin (with `SEED_PASSWORD`), then Administration → Category review → check the list and apply it (D6). Until then, older categories show as Other in Explore. Then check Home, Explore, My Communities and Profile at phone width.
- Caveats: data lives in files in the app folder — persistence across redeploys/restarts is unconfirmed, so treat it as a pilot; move to a managed PostgreSQL (`DATABASE_URL`) before real members — it also drops memory to ~256–512 MB.

## Architecture (server/)

- `app.js` buildApp (helmet CSP, cookies, rate limits, error handler, ajv `removeAdditional:false`), `index.js` (+ scheduled-post publisher every 60s).
- `lib/`: `session.js` (HttpOnly hashed sessions, per-request status check, double-submit CSRF `c1_csrf` + `x-csrf-token`, `idempotent()` via `Idempotency-Key`), `permissions.js` (platform roles), `community.js` (`access()` — the single community permission function; admin mode only with header `x-admin-mode: 1` + audited), `relations.js` (connections/blocks), `settings.js` (versioned, allow-listed), `audit.js`, `mailer.js` (outbox), `crypto.js` (scrypt).
- `routes/`: `auth.js`, `admin.js`, `profiles.js`, `connections.js`, `communities.js`, `posts.js`, `events.js` (+ exported `listEvents`/`presentEvents`), `dashboard.js`, `dev.js`. `shared/recurrence.js` (time-zone-aware series expansion) is used by both server and web app.
- `migrations/`: 001 foundation, 002 profiles, 003 connections, 004 communities/posts, 005 events (with `rsvp_deadline`).
- Gotchas learned: inside `db.tx(...)` use only `t.query` (PGlite deadlocks on outer `db`); cast reused SQL params (`$6::text`); never select two columns with the same name (`status`); `@fastify/static` must use `wildcard: true`; missing `/assets/*` must 404, not index.html.

## Client (src/) bridge pattern

Server is the authority; legacy screens still read the local store. `lib/api.js` (CSRF, idempotency, 401 → `c1-signed-out`), `components/auth/AuthSync.jsx` (session check, `syncDirectory`, `syncCommunities`, fires `c1-session-changed`), `lib/people.js` (`users/merge`), `lib/communities.js` (`communities/merge`), `lib/feed.js`, `lib/events.js` (events + dashboard; `fromServer` keeps the old ms/`scope` shape; `useEvents` hook). Shell: `components/Layout.jsx` (platform sidebar / top bar / phone bottom bar). `lib/communities.js` `communityPath(id)` is the one place that says where a community opens. Already on the server: auth pages, People/profiles/directory/connections/blocks, Groups & Spaces, Feed, Events/Calendar/reminders, Dashboard.

**Still on local data:** TownHalls (parked), Dashboard widget layout (per-user pref), Search index (incl. events), Admin screens (Members, Moderation, settings UI), scheduler/workflow runners, signed-out Explore, admin data export/analytics (read old `state.events`), notifications.

## Where we stopped — Stage 6 done (12 Nov 2026)

Stages 1–3 are built and browser-checked (§14). Stage 3: community pages `src/pages/Community.jsx` (`/c/:slug`, tabs; old `/groups/:id` and `/feed/wall` redirect), `src/pages/Groups.jsx` (My Communities / Explore from `GET /communities`), `src/pages/Search.jsx` + `server/routes/search.js`, `src/pages/Welcome.jsx` (onboarding; gate in `App.jsx` `Protected`), profile in `src/pages/People.jsx`. R4: migration `006_core.sql`, `server/lib/merge.js`, `server/scripts/undo-merge.mjs`; the seed merges All Hands (g0) once.

Refined designs approved 11 Nov 2026 (design canvas, page "Refined designs"). Step 1 is in: the surface levels, text levels, type scale and community accent tokens in `src/styles/index.css` (`.band`, `.raised`, `.sunken`, `.t-*`, `.cm-*`), 44 px buttons, and a stored accent per community (migration `007_accents.sql`, `pickAccent` in `server/lib/community.js`, `accentOf` in `src/lib/communities.js`). Community pages have the accent cover and tabs; every community tile uses its accent. Step 2: Landing (`src/pages/Landing.jsx`: search first, opening Explore with `?q=`/`?category=`; accent mosaic; AlumniZone section; "Inside every community" tabs) and Home (`src/pages/Dashboard.jsx`: one featured item, chosen in the order replies to you → Mandatory Read → connection requests → next event; then New in your communities, Coming up and You might join, all from `GET /dashboard`, which now returns `replies`, `recentPosts` and `suggested`). Home's widget editor is gone. Step 3: community Overview (welcome + composer for members in their first 30 days who haven't posted, using `membership.joinedAt`; pinned band; discussion list; next event as the featured item with RSVP, placed first on phones) and Platform Admin → Overview (`src/components/admin/Overview.jsx`, `GET /admin/overview`: totals, needs attention, recent audit activity, communities table with `canOpen`). Administrative Mode: `/c/:slug?admin=1` for platform staff; `setAdminScope` in `src/lib/api.js` limits the header to that community.

Rules to keep: a merged community keeps its memberships (for undo), so every "my communities" query must have `c.merged_into is null`. AlumniZone is deliberately not in `state.groups` (older screens treat those as optional groups); community pages read the server directly and listen for `c1-community-changed` (fired by `refreshCommunity`). Lime is the platform's colour only: communities use their accent, never lime. Any new query that returns communities should include `c.accent`.

Waiting on the user: Terms of Service text and a contact address. The AppSail upload happens once, after the last stage.

Logo: the user's artwork redrawn as SVG: `LogoMark` / `Logo` (with optional `tagline`) in `src/components/ui.jsx`, and the app icon in `public/favicon.svg`.

Role views: `src/components/groups/RolePanel.jsx` (owner health + checklist, admin decision queue, moderator review queue) on the Overview; `GET /communities/:id/health`.

Feed, People and Calendar are on the refined system (shared `PageHeader`/`Tabs` too).

Stage 4 (engagement) is built: Resources, Discussions with topics and attachments, Notifications, Saved, the event waitlist, Members search and filters. See PHASE0_ASSESSMENT.md for the open items.

Stage 4 leftovers done (`5d975aa`): `server/lib/jobs.js` runs each minute from `server/index.js`. It handles scheduled posts, event reminders (NTF-04), email retries up to 3 attempts (NTF-03), and a waitlist sweep that gives a removed member's place to the next person. The tests call `sendReminders` / `retryEmails` / `sweepWaitlists` directly.

Pushed up to `efd9d90` (Stage 6).

### Stage 5a: built and browser-checked
Details and what was checked are in PHASE0_ASSESSMENT.md ("Redesign Stage 5a — learning"); LMS-01–15 in the register.
- Server: `009_learning.sql`, `server/routes/learning.js`, 13 tests in `server/test/learning.test.js`. Rule from the hang: check permissions before `db.tx`, and use only `t` inside it. Draft courses are 404 to anyone who can't manage them. `GET /lessons/:id` also returns `community` and `missingFiles`.
- Client: `src/lib/learning.js` (paths, hooks, helpers), `src/components/learning/` (`Catalogue`, `CoursePage`, `Builder`, `bits`), `src/pages/Lesson.jsx`, `src/pages/MyLearning.jsx`, the Learning tab in `Community.jsx`, the Learning card on Home, and My Learning in the sidebar (`Layout.jsx`). Routes are in `src/lib/modules.js`: `/c/:id/:tab/:sub[/:mode]`, `/learning`, `/lessons/:id`. A lesson hides the phone bottom bar (focus mode).
- Not built (5a): lesson questions, choosing existing files, a text toolbar (lessons are plain text with `##` and `-`), the Instructor frame in RolePanel, drag to reorder.
- Preview for this session: launch entry `communityone-5a` (port **5183**) in the Portfolio folder's `.claude/launch.json`, copy in this session's scratchpad. Its DB has one test course, "Career switching for alumni" (Ishita completed it, Priya is 1 of 3, Karthik is on the waitlist).

### Stage 5b: built and browser-checked
Details in PHASE0_ASSESSMENT.md ("Redesign Stage 5b — assessment"); ASM-01–14 in the register.
- Server: `010_assessment.sql`, `server/routes/assessment.js` (registered from `learning.js`, which passes in `loadCourse` etc.), 20 tests in `server/test/assessment.test.js`. Quizzes and assignments are lesson kinds whose progress row is written only on a pass; `finish()` completes the course and issues the certificate. Full suite: 210 pass.
- Client: `src/components/learning/` `Quiz`, `Assignment`, `Grading`, the builder's question editor; `src/pages/Verify.jsx` is public (`/verify/:code`, routed outside `Protected` in `App.jsx`).
- Limits: no revoke action, no rubrics, no deadline grace, PDF = browser print.

### Stages 6 and 7: layouts drawn, waiting for approval (12 Nov 2026)
On the design canvas, pages "Stage 6 — Management" (S6Plan, S6Manage, S6Moderation, S6Members, S6Settings, S6Analytics, S6Mobile) and "Stage 7 — Platform administration" (S7Plan, S7Users, S7Communities, S7Moderation, S7Settings, S7Activity). **Stage 6 decisions D1–D8 approved by the user on 12 Nov 2026** ("Approve, build 6"), as written on S6Plan. **Stage 7 decisions D1–D8 approved by the user on 12 Nov 2026** ("approve build 7"), as written on S7Plan (board unchanged since it was drawn).
- Stage 6 needs new server tables: reports, cases (snapshot + history), sanctions, appeals, deletion_requests, daily community_stats. There is no reporting at all yet.
- Stage 7 replaces the old local-data admin screens (Members, Moderation, Analytics) and adds the deletion job (30-day restore), announcements, sessions and fresh-password checks.

### Stage 6: built and browser-checked
Details in PHASE0_ASSESSMENT.md ("Redesign Stage 6 — community management"); MOD, DEL, ANL, SET, MEM rows in the register.
- Server: `011_moderation.sql` (moderation_cases, reports, case_events, sanctions, appeals, deletion_requests; removed_at on comments/events/posts), `server/routes/moderation.js` (reports, cases, decide/restore, appeals, member sanctions, `liftExpiredRestrictions` in the job runner), `server/routes/manage.js` (deletion requests, analytics + CSV), 20 tests in `server/test/moderation.test.js`. Full suite: 230 pass.
- Client: `src/components/manage/` (Manage, Cases, ManageMembers, Analytics, Report), `src/pages/Notice.jsx`, `src/lib/manage.js`. The community page's Settings tab became Manage (`/c/:slug/manage/:section`); `CommunityView` now compares the real address to rewrite old ones.
- Rules to keep: a case's audience is fixed at the first report (D1); moderators' removals of replies/events set `deleted_at` too, so existing queries hide them; reporters are never named in the review.

### Stage 7: built and browser-checked (12 Nov 2026)
Details in PHASE0_ASSESSMENT.md ("Redesign Stage 7 — platform administration"); COM-08, PER-14, MOD-10, SET-05, DEL-07/09/10/12/13/14 in the register.
- Server: `012_platform.sql`, `server/routes/platform.js` (communities, deletion + `purgeDeletedCommunities`, moderation centre, settings sections, features, roles, announcements, activity log, analytics, `/admin/waiting`, `/admin/confirm-password`), users/roles changes in `routes/admin.js`, escalation + MOD-06 conflict in `routes/moderation.js`, file limits from settings in `lib/files.js`, `requireFreshPassword` in `lib/session.js`. 23 tests in `server/test/platform.test.js`.
- Client: `src/pages/Admin.jsx`, `src/components/platform/*`, `src/lib/platform.js`; announcement bar on Home; "Send to CommunityOne…" in the Stage 6 case view; `api(path, { adminMode: true })`.
- Rules to keep: a deleted community is `status = 'deleted'` — every new community query must exclude it (lists already require `status = 'active'`/archived; places that said `<> 'suspended'` now say `not in ('suspended', 'deleted')`). Losing a platform role ends sessions (so tests expect 401). A community has one Owner (`memberships_one_owner`).
- **Test runner quirk:** every file passes on its own (platform 23/23, all others as before), but the full `npm run test:server` run used to stall sometimes with an idle child process. **Fixed 12 Nov (v2 stall fix):** it was a Node 23 deadlock while PGlite starts up, and `createDb` now keeps the event loop open until PGlite is ready. One form of the same Node deadlock can still happen at process exit; none of the test runs hit it. If a run stalls anyway, run the files one at a time. Upgrading Node to a supported release is the complete fix.
- Preview for this session: launch entry `communityone-7` (port **5184**) in the Portfolio folder's `.claude/launch.json`.

### v2 workstream A: done (12 Nov 2026)
Proposal approved with the recommended P1–P5. No default community; the P1 data migration (logged, undoable, rehearsed); feature flags enforced; the `/verify` route clash fixed; Playwright journeys (`npm run test:e2e`). Details are in the progress log ("v2 brief — workstream A").
- Rules to keep: never add anyone to a community they didn't choose. Data changes go through `lib/data-migrations.js` (once, logged, undoable). New parked pages get a `flag` in `lib/modules.js`.

### v2 workstream B: foundation done (12 Nov 2026)
Board approved (B1–B5). Light-first tokens, Lucide icons, emoji removed from reachable screens, `components/ui/` (Controls, Confirm). Details are in the progress log ("v2 brief — workstream B").
- Rules to keep: no emoji anywhere (use `<Icon name>`); new UI uses the `--az-*` tokens and `components/ui`, never `text-white` or slate classes; use `confirmAction()`, never `confirm()`.

### v2 parallel round: server work merged, boards C–G drawn (12 Nov 2026)
Built by parallel agents on their own branches. Each branch was reviewed by a second agent, fixed where needed, then merged into main:
- `v2-test-stall`: the stall fix in `server/db/index.js`.
- `v2-b-parked`: no emoji or `confirm()` left in the parked modules. `server/test/source-rules.test.js` keeps it that way.
- `v2-g-health`: `job_runs` (migration 018) and `GET /api/admin/health`, which needs the `health.view` permission.
- `v2-f-templates`: 8 templates, versions, the 9 categories, and `/api/admin/templates` (migration 015).
- `v2-f-invites`: invitations for Closed communities (migration 016).
- `v2-e-branding`: logo, cover and accent (migration 017), plus enforced section switches.

After the merge, templates write `settings.sections` (the one list `sectionOn` reads), and topics follow the Discussions switch. All of this is server-only: the screens for these features aren't built yet. Each entry in the progress log has its own "Not done here" list.

Boards for C, D, E, F and G are on the design canvas, one page each ("v2 C: …" to "v2 G: …"). Each board's plan lists its decisions (C1–C14, D1–D12, E1–E13, F1–F14, G1–G12).

### v2 workstream C: built (12 Nov 2026)
The landing page, About, the public header and footer, Sign in, Create account, `/forgot`, the email-link pages and the welcome steps are on the boards' one-card layout and the `--az-*` tokens. Three server messages now use platform wording (C10). Browser journeys are in `e2e/public.spec.js`. Details are in the progress log ("v2 — Workstream C").
- Rules to keep: public pages show only numbers from the API, and product pictures are labelled Example. Nothing on these screens joins anyone to a community. Emails pass between pages in router state, never in the address.

### v2 workstream D: built (12 Nov 2026)
The shell, Home (and first-run Home), Explore, My Communities, Profile, search with suggestions, the category review (D6), and the restyled Notifications, Saved, Events and My Learning. Details are in the progress log ("v2 — Workstream D").
- Rules to keep: navigation lists only real destinations and memberships. The Create menu and quick actions come from the server's `canPostIn` and `canCreateEventsIn`. A profile never reveals a Private or Closed membership (VIS-16). Old addresses redirect rather than break.

### v2 workstream E: built (12 Nov 2026)
The community header with logo and cover, section tabs that follow the switches, the new Overview, Discussions, Events with Month, Resources, the Members directory, the Learning restyle, Manage → Branding and the Sections switches. Details are in the progress log ("v2 — Workstream E").
- Rules to keep: a community's accent is identity only (cover band, tiles, tab underline, date tiles); controls stay the platform colour (E3). Data changes go through `lib/data-migrations.js`; `e2-sections` runs at every start. Deleting a community has one path, the Stage 7 review.

**Next:** workstream F (creation wizard, templates and invitation screens), once its board is approved; then G, as in `PROPOSAL_V2.md` §12–13. The AppSail bundle on record is from after D; build a new one only when the user asks. The open server decisions from the parallel round are in that round's report (category required or not, an older template version, resend and the invitee list, announcements while Discussions is off, version.json in the bundle).

**Earlier note:** the user sent a new master brief (`MASTER_BRIEF_V2.md`) on 12 Nov. Its order: finish Stage 7 (done), then inspect + audit + present the proposal with an itemised ETA, and **wait for approval** before any of it. Stage 8 (polish) and Smart Assist are folded into that proposal. The final AppSail zip is still built once, at the end.

## Working style that's been effective

- Each step: server + migration + seed → tests named by edge-case ID → client switch → browser journeys (incl. double clicks, two tabs, phone width 375px) → register/progress log → commit → wrap up asking to push.
- Report honestly: bugs found while testing, what wasn't verified, what's still local.
- Explanatory output style: include a short `★ Insight` block.

## How the remaining work maps to the master prompt

| Master prompt section | Status | Where it lands |
| --- | --- | --- |
| §2 Inspect, inventory, migration plan | Done | Phase 0 |
| §6 Accounts & profiles, §15 security foundations | Done (no 2FA, avatars yet) | Phase 1 steps 1–3 |
| §5 Public/Private/Closed, §8 roles/states (server) | Foundation done | Phase 1 step 4b; invitations Phase 2 |
| §9 Admin override + Administrative Mode | Server done (header) | UI toggle + banner Phase 1 step 5 / Phase 2 |
| Events foundation, member dashboard (§11) | Done | Phase 1 step 4c (waitlist, notifications Phase 2) |
| §13 Platform Admin settings, §11 control centre | Server API partly done | Phase 1 step 5 |
| §17 CommunityOne branding, §4 platform navigation | Not started | Phase 1 step 7 (+ nav restructure in Phase 2) |
| §7 creation wizard, §12 community settings + deletion requests, resources, notifications/email, moderation reports | Not started | Phase 2 |
| §4/§10 Learning module (basic) | Not started | Phase 2 (basic) → Phase 3 (full LMS) |
| §14 analytics/WMAM, exports | Not started | Phase 2 (community) → Phase 4 (platform) |
| Phase 5 AI | Parked | Last |
