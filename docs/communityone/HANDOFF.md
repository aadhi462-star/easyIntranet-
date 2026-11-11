# CommunityOne — Session handoff (10 Nov 2026, after step 4c)

Read this first in a new session, then **`docs/communityone/MASTER_PROMPT.md` (the user's governing brief — the goal of all of this)** and **`docs/communityone/REDESIGN_BRIEF.md` (the UI/UX redesign brief: experience, brand, screen structure; approval before each stage)**, then `docs/communityone/PHASE0_ASSESSMENT.md` (§10 decisions, §11 plan, §14 progress log) and `docs/communityone/EDGE_CASE_REGISTER.md`.

## What this project is

- Repo: `/Users/jaswa-zsbch1582/Desktop/My projects/Game rush/alumnizone` (GitHub: `aadhi462-star/easyIntranet-`, branch `main`).
- Transforming the AlumniZone prototype (React 18 + Vite 6 + Tailwind 4, browser-only data) into **CommunityOne — "One Platform. Every Community."** per the user's master prompt and three docs (`~/Downloads/Community_Platform_Conversation_Consolidated.docx`, `…Comprehensive_Edge_Cases.docx` (244 cases), `Alumni_Zone_Revamp_Product_Roadmap.docx`). Text copies: `/private/tmp/claude-502/-Users-jaswa-zsbch1582-Desktop-My-projects-Game-rush/6469d2af-edfc-488e-8a21-3b3982a1aa17/scratchpad/refdocs/` (may be gone in a new session — re-extract with `textutil -convert txt`).
- User preferences: open community, no paid features, no external integrations; graphite + lime theme with light/dark; "Smart Assist" (never "Zia"); AI only in Phase 5; push to GitHub only when the user says so (they've said "Push" after each step so far).

## Decisions (approved)

D1 Node.js + Fastify + **PostgreSQL** (PGlite locally, `DATABASE_URL` for a real server) · D2 park Tasks/Custom Apps/Web Tabs/Live/Town Halls/Channels/Surveys/Ideas/Leaderboard/Smart Assist behind flags (flags exist in DB `feature_flags`, **not yet read by the client**) · D3 network-wide content → public community `alumnizone` · D4 institutions → departments → batches are first-class · D6 Super Admin = Sara Thomas (`u7`) · D7 PGlite. D5 (email) → Catalyst Mail on AppSail (`MAIL_TRANSPORT=catalyst`); locally emails still go to the server log + `/api/dev/outbox`.

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

## Where we stopped — redesign Stage 2 done (committed, not pushed)

Stages 1–2 are built and browser-checked (§14). Public site: `src/components/public/*`, `src/pages/{Landing,Explore,About,Help,Privacy,Terms,Contact}.jsx`, `src/lib/public.js`; server `routes/public.js`; default-community join in `lib/community.js` (`joinDefaultCommunity`, called from email verify and admin approve).

Waiting on the user: Terms of Service text and a contact address (the pages say they aren't published yet).

Next: **redesign Stage 3 — core application**: Home, Explore and My Communities in the new layout; community pages for every community incl. AlumniZone at `/c/:slug` (old `/groups/:id` and `/feed/wall` redirect; change `communityPath`); community header/tabs per the wireframe; Profile; global search on the server (SRC-01/02/05); R4 (merge All Hands into AlumniZone, reversible); onboarding after sign-up (profile basics, choose communities).

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
