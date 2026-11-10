# CommunityOne — Session handoff (10 Nov 2026)

Read this first in a new session, then `docs/communityone/PHASE0_ASSESSMENT.md` (§10 decisions, §11 plan, §14 progress log) and `docs/communityone/EDGE_CASE_REGISTER.md`.

## What this project is

- Repo: `/Users/jaswa-zsbch1582/Desktop/My projects/Game rush/alumnizone` (GitHub: `aadhi462-star/easyIntranet-`, branch `main`).
- Transforming the AlumniZone prototype (React 18 + Vite 6 + Tailwind 4, browser-only data) into **CommunityOne — "One Platform. Every Community."** per the user's master prompt and three docs (`~/Downloads/Community_Platform_Conversation_Consolidated.docx`, `…Comprehensive_Edge_Cases.docx` (244 cases), `Alumni_Zone_Revamp_Product_Roadmap.docx`). Text copies: `/private/tmp/claude-502/-Users-jaswa-zsbch1582-Desktop-My-projects-Game-rush/6469d2af-edfc-488e-8a21-3b3982a1aa17/scratchpad/refdocs/` (may be gone in a new session — re-extract with `textutil -convert txt`).
- User preferences: open community, no paid features, no external integrations; graphite + lime theme with light/dark; "Smart Assist" (never "Zia"); AI only in Phase 5; push to GitHub only when the user says so (they've said "Push" after each step so far).

## Decisions (approved)

D1 Node.js + Fastify + **PostgreSQL** (PGlite locally, `DATABASE_URL` for a real server) · D2 park Tasks/Custom Apps/Web Tabs/Live/Town Halls/Channels/Surveys/Ideas/Leaderboard/Smart Assist behind flags (flags exist in DB `feature_flags`, **not yet read by the client**) · D3 network-wide content → public community `alumnizone` · D4 institutions → departments → batches are first-class · D6 Super Admin = Sara Thomas (`u7`) · D7 PGlite. D5 (email provider) open — emails go to the server log + `/api/dev/outbox`.

## Run / test

```bash
npm install
npm run db:seed        # migrations + idempotent seed from server/seed/prototype.json
npm run build && npm run server   # http://localhost:5181 (API + built app)
npm run test:server    # node:test, in-memory PGlite — 99 tests, all pass at last commit
```

Demo logins: `DEMO_ACCOUNTS.md` (most: `Community-Demo-2026`; hosts `neha.host@example.com` / `Lime-Host-4821`; member `ishita@example.com` / `Alumni-Member-2093`; test signup `riya.menon@example.com` / `riya-new-pass-1` exists only in the preview DB).

### Preview quirk (important)
Processes can't run with cwd on the Desktop (EPERM). The preview runs a **copy** in the scratchpad:
- launch entry `communityone` in `/Users/jaswa-zsbch1582/Desktop/My projects/Game rush/.claude/launch.json` (python chdir → node `server/index.js`, PORT 5181, `PGLITE_DIR=<copy>/data`, `STATIC_DIR=<copy>/dist`).
- Copy dir: `/private/tmp/claude-502/-Users-jaswa-zsbch1582-Desktop-My-projects-Game-rush/6469d2af-edfc-488e-8a21-3b3982a1aa17/scratchpad/run/communityone` (a new session gets a new scratchpad — recreate: `rsync -a --exclude .data server package.json node_modules` + `dist/`, then `PGLITE_DIR=<copy>/data node server/scripts/seed.mjs`, and update the launch.json path).
- Deploy: `npx vite build` → `rsync -a --delete --exclude .data server $R/` and `rsync -a dist/ $R/dist/` (no `--delete` on dist, keeps old chunks).
- **Rule: stop the preview server before running seed/migrations on its PGlite dir** (PGlite is single-process).

## Architecture (server/)

- `app.js` buildApp (helmet CSP, cookies, rate limits, error handler, ajv `removeAdditional:false`), `index.js` (+ scheduled-post publisher every 60s).
- `lib/`: `session.js` (HttpOnly hashed sessions, per-request status check, double-submit CSRF `c1_csrf` + `x-csrf-token`, `idempotent()` via `Idempotency-Key`), `permissions.js` (platform roles), `community.js` (`access()` — the single community permission function; admin mode only with header `x-admin-mode: 1` + audited), `relations.js` (connections/blocks), `settings.js` (versioned, allow-listed), `audit.js`, `mailer.js` (outbox), `crypto.js` (scrypt).
- `routes/`: `auth.js`, `admin.js`, `profiles.js`, `connections.js`, `communities.js`, `posts.js`, `dev.js`.
- `migrations/`: 001 foundation, 002 profiles, 003 connections, 004 communities/posts, **005 events (written, NOT yet applied/tested/committed)**.
- Gotchas learned: inside `db.tx(...)` use only `t.query` (PGlite deadlocks on outer `db`); cast reused SQL params (`$6::text`); never select two columns with the same name (`status`); `@fastify/static` must use `wildcard: true`; missing `/assets/*` must 404, not index.html.

## Client (src/) bridge pattern

Server is the authority; legacy screens still read the local store. `lib/api.js` (CSRF, idempotency, 401 → `c1-signed-out`), `components/auth/AuthSync.jsx` (session check, `syncDirectory`, `syncCommunities`, fires `c1-session-changed`), `lib/people.js` (`users/merge`), `lib/communities.js` (`communities/merge`), `lib/feed.js`. Already on the server: auth pages, People/profiles/directory/connections/blocks, Groups & Spaces, Feed.

**Still on local data:** Events/Calendar/TownHalls, Dashboard, Search index, Admin screens (Members, Moderation, settings UI), scheduler runners, signed-out Explore, notifications.

## Where we stopped — Phase 1 step 4c (events + member dashboard)

Done: `server/migrations/005_events.sql` (events, event_staff, event_invitees, event_rsvps, event_comments).

Next:
1. `server/routes/events.js`: list (`from/to/community/view`), detail, create (`POST /communities/:id/events`, idempotent, validate start≤end, recurrence until ≥ start), edit (host/co-host/community admin, versioned), cancel with reason, delete, RSVP upsert (one per member, capacity check in a transaction, no RSVP on cancelled), invite-only visibility (EVT-08), comments. Reuse `src/components/events/eventUtils.js` (pure, no imports) for recurrence/next occurrence on the server.
2. `GET /api/dashboard`: my communities, next events, unacknowledged Mandatory Reads, recent announcements, connection requests count, new members.
3. Seed: prototype `events` (scope network → `alumnizone`, group → same id, private → `alumnizone` + `invite_only` with invitees), RSVPs, assistants, comments.
4. Tests (EVT-01/02/04/05/07/08, VIS paths) in `server/test/events.test.js`.
5. Client: switch `pages/Events.jsx`, `pages/Calendar.jsx`, `components/events/*`, `lib/runners/eventReminders.jsx` and `pages/Dashboard.jsx` to the API (two parallel agents with disjoint files worked well before). Hide parked widgets (tasks, leaderboard).
6. Browser-verify, update the register + §14 progress log, commit, ask to push.

Then: Phase 1 step 5 (platform admin UI on the API: users, suspend/approve, roles, settings, audit, institutions), step 6 (remaining client data layer + react-router 7 upgrade for the open-redirect advisory), step 7 (CommunityOne rebrand + read feature flags in the client). Then Phase 2.

## Working style that's been effective

- Each step: server + migration + seed → tests named by edge-case ID → client switch → browser journeys (incl. double clicks, two tabs, phone width 375px) → register/progress log → commit → wrap up asking to push.
- Report honestly: bugs found while testing, what wasn't verified, what's still local.
- Explanatory output style: include a short `★ Insight` block.
