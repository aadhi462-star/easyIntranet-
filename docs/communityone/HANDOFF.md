# CommunityOne — Session handoff (12 Nov 2026, after Stage 5b)

Read this first in a new session, then **`docs/communityone/MASTER_PROMPT.md` (the user's governing brief — the goal of all of this)** and **`docs/communityone/REDESIGN_BRIEF.md` (the UI/UX redesign brief: experience, brand, screen structure; approval before each stage)**, then `docs/communityone/PHASE0_ASSESSMENT.md` (§10 decisions, §11 plan, §14 progress log) and `docs/communityone/EDGE_CASE_REGISTER.md`.

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

## Where we stopped — Stage 5 done (12 Nov 2026)

Stages 1–3 are built and browser-checked (§14). Stage 3: community pages `src/pages/Community.jsx` (`/c/:slug`, tabs; old `/groups/:id` and `/feed/wall` redirect), `src/pages/Groups.jsx` (My Communities / Explore from `GET /communities`), `src/pages/Search.jsx` + `server/routes/search.js`, `src/pages/Welcome.jsx` (onboarding; gate in `App.jsx` `Protected`), profile in `src/pages/People.jsx`. R4: migration `006_core.sql`, `server/lib/merge.js`, `server/scripts/undo-merge.mjs`; the seed merges All Hands (g0) once.

Refined designs approved 11 Nov 2026 (design canvas, page "Refined designs"). Step 1 is in: the surface levels, text levels, type scale and community accent tokens in `src/styles/index.css` (`.band`, `.raised`, `.sunken`, `.t-*`, `.cm-*`), 44 px buttons, and a stored accent per community (migration `007_accents.sql`, `pickAccent` in `server/lib/community.js`, `accentOf` in `src/lib/communities.js`). Community pages have the accent cover and tabs; every community tile uses its accent. Step 2: Landing (`src/pages/Landing.jsx`: search first, opening Explore with `?q=`/`?category=`; accent mosaic; AlumniZone section; "Inside every community" tabs) and Home (`src/pages/Dashboard.jsx`: one featured item, chosen in the order replies to you → Mandatory Read → connection requests → next event; then New in your communities, Coming up and You might join, all from `GET /dashboard`, which now returns `replies`, `recentPosts` and `suggested`). Home's widget editor is gone. Step 3: community Overview (welcome + composer for members in their first 30 days who haven't posted, using `membership.joinedAt`; pinned band; discussion list; next event as the featured item with RSVP, placed first on phones) and Platform Admin → Overview (`src/components/admin/Overview.jsx`, `GET /admin/overview`: totals, needs attention, recent audit activity, communities table with `canOpen`). Administrative Mode: `/c/:slug?admin=1` for platform staff; `setAdminScope` in `src/lib/api.js` limits the header to that community.

Rules to keep: a merged community keeps its memberships (for undo), so every "my communities" query must have `c.merged_into is null`. AlumniZone is deliberately not in `state.groups` (older screens treat those as optional groups); community pages read the server directly and listen for `c1-community-changed` (fired by `refreshCommunity`). Lime is the platform's colour only: communities use their accent, never lime. Any new query that returns communities should include `c.accent`.

Waiting on the user: Terms of Service text and a contact address. The AppSail upload happens once, after the last stage.

Logo: the user's artwork redrawn as SVG: `LogoMark` / `Logo` (with optional `tagline`) in `src/components/ui.jsx`, and the app icon in `public/favicon.svg`.

Role views: `src/components/groups/RolePanel.jsx` (owner health + checklist, admin decision queue, moderator review queue) on the Overview; `GET /communities/:id/health`.

Feed, People and Calendar are on the refined system (shared `PageHeader`/`Tabs` too).

Stage 4 (engagement) is built: Resources, Discussions with topics and attachments, Notifications, Saved, the event waitlist, Members search and filters. See PHASE0_ASSESSMENT.md for the open items.

Stage 4 leftovers done (`5d975aa`): `server/lib/jobs.js` runs each minute from `server/index.js`. It handles scheduled posts, event reminders (NTF-04), email retries up to 3 attempts (NTF-03), and a waitlist sweep that gives a removed member's place to the next person. The tests call `sendReminders` / `retryEmails` / `sweepWaitlists` directly.

Pushed up to `dcc7cf5` (Stage 5a client). Stage 5b is committed, not pushed.

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

**Next:** layouts for Stage 6 (moderation) and Stage 7 (management) for approval, then Stage 8 (polish). Smart Assist comes last and needs a decision from the user, because the no-paid/no-external rule rules out most AI providers. The final AppSail zip is built once, at the end, from the alumnizone folder.

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
