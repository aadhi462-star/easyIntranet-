# CommunityOne — Phase 0 Assessment and Implementation Plan

*One Platform. Every Community.*

Status: **Decisions D1–D4, D6 (default) and D7 (PGlite) approved.** D5 open (email provider).
**Phase 1 progress (10 Nov 2026):** steps 1–3 and 4a done and tested (server foundation, accounts, profiles and directory, connections and blocks); see §14.
Inputs: the three reference documents (Consolidated requirements, Edge-case register, Revamp roadmap), the Master Development Prompt, and a code-level inspection of the current AlumniZone app (`src/`, ~14,100 lines, 27 pages).

---

## 1. Summary

The current app is a **feature-rich, front-end-only prototype**. It has most of the *screens* CommunityOne needs (feed, groups, events, people, files, moderation, admin, analytics), and the code has been through five review rounds. But it has **no server**: all data lives in each visitor's browser (`localStorage`, files in IndexedDB), every permission check runs in the browser, and two people on different devices never see each other's activity.

That single fact decides the plan:

- **110 of the 244 edge cases are P0**, and almost all of them require *server-side* enforcement (backend permission checks, unique constraints, atomic counters, revocable sessions, expiring file URLs, idempotent jobs). They cannot be satisfied in the current architecture, no matter how carefully the client is written.
- So CommunityOne needs a **real backend and database** before any community or LMS feature can be called complete. This is the main architectural decision in this document and needs your approval (§10).
- The good news: the React UI, design system, information architecture and much of the business logic (visibility rules, membership rules, recurrence maths, sanitisation, notifications) are reusable. The work is mostly *moving the rules to the server and reshaping groups into communities*, not starting again.

There is **no production user data** to migrate: the only data is the seeded demo set plus whatever individual browsers have stored locally. Migration is therefore low-risk (§5).

---

## 2. Current architecture

| Layer | Today |
| --- | --- |
| Frontend | React 18.3, Vite 6, Tailwind 4, react-router 6 (`HashRouter`), lazy-loaded pages from a module registry (`src/lib/modules.js`) |
| State | One reducer (`src/lib/store.jsx`), persisted to `localStorage` key `alumnizone:v3`; idle saves; cross-tab sync via the `storage` event |
| Data | Seeded demo data (`src/data/seed.js`, `src/data/modules/*.js`): 34 users, 8 groups, posts, events, files, etc. |
| Auth | Client-side only. Signed-up accounts store a salted SHA-256 hash in the browser; seeded accounts accept any password. No sessions, no tokens, no verification email |
| Permissions | `can(state, me, perm)` + role list in the browser; per-page visibility helpers (`canSee`, `canSeeGroupItem`, …) |
| Files | Browser IndexedDB (`fileStore.js`); event attachments as data URLs |
| Background jobs | "Runners" (React components on timers) in each open tab: scheduled posts, reminders, workflows, schedulers, dynamic membership, celebrations, saved-search alerts |
| Notifications | In-app only, stored in the same browser state. No email/push |
| Search | Client-side index (`src/lib/searchIndex.js`), visibility-filtered |
| AI | "Smart Assist": Chrome on-device AI with local fallbacks |
| Hosting | Static files; locally served on port 5180 |

### Strengths to keep
- Clear module registry and lazy routing; reusable UI kit (`ui.jsx`, illustrated icons, Modal with focus trap).
- Graphite/lime design system with light and dark mode, responsive down to 375 px, keyboard-accessible dialogs.
- Mature domain rules already written and reviewed: visibility helpers, membership/opt-out rules, event recurrence, Mandatory Read audiences, HTML sanitiser allow-list, CSV/export helpers.

### Structural limitations
- **No trust boundary.** Anyone can edit `localStorage` and become admin, read "private" data, or bypass any rule.
- **No shared data.** Not a multi-user system yet.
- **Single network model.** The app is one "network" (AlumniZone) with groups inside; CommunityOne needs the *community* as the primary unit, with one account across many communities and a different role in each.
- **Single role per user.** `admin: true` or a network `roleId`; no per-community roles beyond group admin/moderator.
- **Background work runs in browsers**, so it only happens while someone has the app open.

---

## 3. Feature inventory

Classification: **Keep** (useful as is), **Improve** (enhance), **Replace** (re-implement properly, usually server-side), **Remove** (drop or hide), **Investigate** (needs a product decision).

### Platform and identity

| Feature | Today | Class | CommunityOne target |
| --- | --- | --- | --- |
| Sign-in / sign-up / invite pages | Client-only, demo passwords | **Replace** | Server auth: sessions, verification, reset, lockout, suspension (REG-01–18) |
| Registration settings (open/approval/domains/guidelines) | Admin → Policies | **Improve** | Platform Admin Settings → User & Registration |
| Profiles (bio, career, skills, batch, dept, city, custom fields, privacy) | People page | **Keep / Improve** | Alumni profile + education history, institutions; server-validated |
| Profile strength meter | New | **Keep** | Member dashboard |
| People directory + filters | People page | **Improve** | Alumni directory with privacy-aware server search |
| Follows | `follows` | **Improve** | Connections (request/accept) + follow, per roadmap Phase 1 |
| User labels | Admin → User labels | **Keep** | Platform/community badges |
| Org chart ("Community structure") | Hidden module | **Investigate** | Possibly institution → department → batch view |
| Recognition, points, badges, leaderboard, arcade | Leaderboard | **Investigate** | Docs favour "meaningful participation over vanity metrics"; keep badges/contributions, park leaderboard behind a flag |
| Birthdays / anniversaries / wishes | New | **Keep** | Member dashboard widget |
| Saved searches + alerts | New | **Keep** | Saved → Searches |
| Bookmarks | Per-user | **Keep** | **Saved** (platform nav) |
| Notifications page | In-app | **Replace** | Server notifications + email, preferences, privacy-safe previews (NTF-*) |
| Search | Client index | **Replace** | Server search filtered by current permissions (SRC-*) |
| Dashboard widgets | Dashboard | **Improve** | Role-specific dashboards (§11 of prompt) |
| Theme, menus, Reduce effects, toasts | Shell | **Keep** | Rebrand to CommunityOne |

### Communities and content

| Feature | Today | Class | CommunityOne target |
| --- | --- | --- | --- |
| Groups & Spaces (public / restricted / private) | Groups page | **Replace** → Communities | Public / Private / Closed communities; `restricted` → Private, `private` (already hidden from discovery) → Closed |
| Group roles (admin, moderator) | Per group | **Replace** | Owner / Admin / Moderator / Instructor / TA / Member + membership states |
| Join requests, invites, dynamic membership rules | Groups | **Improve** | Server membership engine (MEM-*, VIS-09/10) |
| Group apps tabs, space dashboard | Groups | **Improve** | Community nav: Overview, Discussions, Learning, Events, Resources, Members, About, Settings |
| Network feed (My Feed, Company Wall, announcements, questions, polls, drafts, scheduled) | Feed | **Improve** | Home feed (joined communities) + community Discussions |
| Mandatory Read | Feed | **Keep** | Community announcements with acknowledgement |
| Moderation queue, banned words, approvals, flags | Admin → Moderation | **Replace** | Server moderation: reports, queues, warnings, restrictions, appeals (MOD-*) |
| Forums (Q&A, categories) | Forums | **Improve** | Community Discussions (question type) |
| Ideas | Ideas | **Investigate** | Could be a discussion type, or removed |
| Events, calendar, RSVP, recurrence, reminders, .ics | Events / Calendar | **Improve** | Events with registration, capacity, waitlist, attendance (EVT-*) |
| Town halls (Q&A sessions) | TownHalls | **Investigate** | Event type "Live Q&A" |
| Live & meetings (local camera only) | Live | **Remove (for now)** | Needs a media server; revisit in Phase 4 integrations |
| Files, folders, docs/sheets/slides editors | Files | **Improve** | Community **Resources** with server storage, scanning, expiring URLs (FIL-*) |
| Manuals (knowledge base) | Manuals | **Improve** | Resources / Learning content |
| Channels & DMs | Channels | **Investigate** | Not in the target IA; keep DMs between connections, community chat later |
| Surveys | Surveys | **Investigate** | Polls in Discussions; full surveys possibly later |
| Tasks & boards | Tasks | **Remove (park)** | Not in target scope; hide behind a flag |
| Custom apps (form builder) | CustomApps | **Remove (park)** | Not in target scope |
| Web tabs (embedded sites) | WebTabs | **Remove (park)** | Not in target scope |
| Workflows, schedulers | Admin | **Replace** | Server background jobs (idempotent, SYS-04) |
| Smart Assist (AI writing, summaries, translation, sentiment) | Feed, Admin | **Remove until Phase 5** | Docs: AI only in the final phase. Hide, keep code for later |

### Administration

| Feature | Today | Class | CommunityOne target |
| --- | --- | --- | --- |
| Admin console tabs (analytics, members, roles, policies, moderation, fields, labels, branding, workflows, schedulers, audit, export, security) | Admin | **Improve** | Platform Admin control centre (Overview, Management, Safety, Insights, Configuration) |
| Roles & permissions (network roles) | Admin → Roles | **Replace** | Platform roles (Super Admin … Support Agent) + community roles, server permission engine |
| Audit log | Derived from activity log | **Replace** | Append-only server audit log for every sensitive action (PER-10) |
| Analytics | Client-computed | **Replace** | Server aggregates, WMAM north-star, privacy thresholds, safe CSV (ANL-*) |
| Data export / encrypted export | Client | **Improve** | Server export with authorisation + audit (ANL-07, ANL-09) |
| Branding & navigation | Admin | **Keep / Improve** | Platform settings → General |
| Admin Mode / global override / deletion requests / Super Admin | — | **New** | Required (§9 and §12 of prompt) |
| Learning (LMS) | — | **New** | Community Learning module, Phases 2–3 |

---

## 4. Data inventory

Collections in the current state (per browser): `users, groups, posts, events, forumPosts, channels, dms, manuals, files, folders, ideas, ideaCategories, surveys, surveyResponses, townhalls, townhallQuestions, meetings, broadcasts, boards, tasks, customApps, appRecords, webTabs, follows, blocks, praise, badgeAwards, userLabels, customFields, roles, invites, flags, notifications, activity, bookmarks, savedSearches, wishes, workflows, schedulers, dashboardWidgets, settings` and template collections.

Key relationships today:

- **User** → many group memberships (`groups[].members/admins/moderators`), posts, events (host/RSVP), files, follows, labels.
- **Group** → scoped posts (`post.scope = {type:'group', id}`), events, forum posts, files, channels (`channel.groupId`), boards, ideas, manuals.
- **Network-scoped content** (`scope.type === 'network'`) belongs to "the whole AlumniZone" — this concept has to become either a default "Alumni" community or platform announcements.
- Alumni structure is **flat fields on the user** (`batch`, `dept`, `city`, `company`, `role`); there are no institution, department or programme entities.

---

## 5. Migration requirements

Because there is no production database, "migration" means: (1) moving the demo seed into the new schema, and (2) optionally importing a browser's saved data for anyone who has been using the prototype.

| From | To | Notes |
| --- | --- | --- |
| `users` | `users` + `profiles` + `education` | Keep ids/emails (REG-01 uniqueness enforced). Seed accounts get real passwords; legacy "any password" removed |
| `users.admin` | platform role **Platform Admin** | One account promoted to **Super Admin** (decision needed) |
| `users.batch/dept` | `education` rows (+ `institutions`, `departments`, `batches` if first-class — decision D4) | |
| `groups` (public / restricted / private) | `communities` (Public / Private / Closed) | Members/admins/moderators → `memberships` with roles; join requests → `membership_requests`; `optedOut` → membership state *Left* |
| Network-scoped posts, events, files, forums | A default **"AlumniZone"** community (Public) owned by the alumni office account | Preserves the alumni experience as a first-class community (decision D3) |
| Group-scoped content | Same community | `scope` → `community_id` |
| `follows` | `connections` (accepted) | |
| `notifications`, `activity` | Not migrated (regenerated) | Activity → new event log from go-live |
| Parked modules (tasks, custom apps, web tabs, meetings) | Kept in an archive export, not imported | Reversible: nothing is deleted |

Safeguards: export everything to JSON before migration, run the migration into a fresh database, verify counts and references with an integrity script, keep the prototype runnable side by side until sign-off. Rollback = keep using the prototype and discard the new database.

---

## 6. Gap analysis against the requirements

| Requirement area | Covered today | Gap |
| --- | --- | --- |
| Backend enforcement, sessions, API security | ✗ | Entire server layer |
| Communities as primary unit, one account / many roles | Partial (groups) | Community entity, memberships, per-community roles, community nav |
| Public / Private / Closed | Partial (client rules) | Server enforcement, invitations bound to recipients, discovery exclusion |
| Platform roles incl. Super Admin + specialist staff | ✗ | Platform role model + scoped staff permissions |
| Platform Admin override + Administrative Mode | ✗ | Mode switch, banner, no membership side effects, audit |
| Community creation wizard | ✗ (simple form) | 6-step wizard, drafts, idempotent create |
| Ownership transfer, last-owner rules | Partial (last admin guard) | Owner role + transfer workflow |
| Deletion request workflow | ✗ | Request queue, email, review, statuses |
| Integrated LMS | ✗ | Courses, modules, lessons, enrolment, progress → assessments, grading, certificates |
| Role dashboards (member, owner, moderator, instructor, platform) | Partial (one dashboard + admin) | Five dashboards |
| Analytics (WMAM, privacy thresholds, exports) | Partial (client) | Server aggregates |
| Email notifications | ✗ | SMTP provider + templates + delivery log |
| Secure files | ✗ | Server storage, type sniffing, scanning hook, expiring signed URLs |
| Branding: CommunityOne | ✗ | Rename across UI, titles, metadata, emails, docs |
| Edge-case register (244) | Client-side subset only | Test plan and automated tests per phase |

---

## 7. Risks

1. **Scope.** The full specification is several months of work for a team. Mitigation: deliver strictly by phase with exit criteria; each phase is usable on its own.
2. **Rewriting working UI.** Moving logic to the server can break screens that work now. Mitigation: keep the UI, swap the data layer behind a thin client API module, page by page.
3. **Security regressions during transition.** Mitigation: the server is the source of truth from the first endpoint; no feature is "done" until its P0 edge cases pass automated tests.
4. **Hosting/email providers.** Real email, file storage and production hosting need accounts you choose (§10, D1/D5). Local development works without them.
5. **Feature parking.** Hiding Tasks, Custom Apps, Web Tabs, Live and Smart Assist may disappoint existing demo users. Mitigation: park behind feature flags, export their data, revisit after Phase 3.
6. **Single developer environment.** No PostgreSQL/Docker on this machine yet. Mitigation: install PostgreSQL with Homebrew, or run PGlite (the PostgreSQL engine as an npm dependency) for local development; production uses a standard PostgreSQL server with the same migrations.

---

## 8. Conflicts and inconsistencies found

| # | Conflict | Resolution proposed |
| --- | --- | --- |
| C1 | **Phase content differs between documents.** Consolidated doc puts communities, roles, moderation and deletion requests in Phase 1 MVP and LMS in Phase 2; the Roadmap doc puts communities in Phase 2 and LMS in Phase 3; the Master Prompt adds a *basic* Learning section in Phase 2. | Follow the **Master Prompt** (latest): Phase 1 core + alumni, Phase 2 communities + basic Learning + admin override, Phase 3 full LMS. |
| C2 | **Earlier instruction** "use Zoho Connect / CommunitySpaces features" vs the new information architecture, which has no Tasks, Custom Apps, Web Tabs, Town Halls or Channels. | Map what fits into the new IA; park the rest behind flags (no deletion). Confirm (D2). |
| C3 | **Smart Assist (AI) exists now**, but all documents say AI only in the final phase. | Hide it until Phase 5; keep the code. |
| C4 | **"No paid features"** (earlier instruction) vs Finance Manager / billing "if monetised". | Consistent if monetisation stays deferred: no billing UI, Finance role not created until needed. |
| C5 | **Gamification** (points, leaderboard, arcade) vs "meaningful participation over vanity metrics". | Keep badges and contribution history; park the leaderboard/arcade (D2). |
| C6 | **Institution structure** is an open decision in the Roadmap ("first-class entities or community categories"). | Needs your decision (D4). |
| C7 | **Mobile navigation**: Consolidated doc suggests a bottom bar (Home, Explore, Create, Alerts, Profile); the Master Prompt lists eight platform items. | Desktop: the eight items. Mobile: bottom bar with five, the rest in a menu. |
| C8 | **"Connect"** appears in the Master Prompt journey and Roadmap Phase 1 (connections), but the Consolidated doc only mentions communities. | Include connections in Phase 1 as the roadmap says. |
| C9 | **Community roles**: Consolidated doc says MVP uses Owner/Admin/Moderator/Member and adds Instructor/TA later; the Master Prompt lists all six. | Build the role model with all six from the start; enable Instructor/TA with the Learning module. |

---

## 9. Target architecture

```
Browser (React + Vite, existing UI)
   │  HTTPS, JSON, cookie session (HttpOnly, SameSite, CSRF token)
   ▼
API server (Node.js 24, Fastify)
   ├─ Auth: sessions, password hashing (argon2/scrypt), verification & reset tokens, rate limits, 2FA (TOTP) later
   ├─ Permission engine: one function `authorize(actor, action, resource)` used by every route
   │     platform role → community role → membership state → visibility → feature flags
   ├─ Domain modules: users/profiles, communities, memberships, content, events, resources, notifications,
   │     moderation, learning, analytics, admin, audit
   ├─ Audit log (append-only), idempotency keys on all creates, optimistic version checks on updates
   ├─ Jobs worker: reminders, scheduled posts, emails, digests (idempotent, retried)
   ├─ File storage: local disk in dev, S3-compatible in production; signed expiring URLs; type sniffing; scan hook
   └─ Email: SMTP adapter (console in dev)
   ▼
Database: PostgreSQL everywhere (decision D1), SQL migrations
   Local development: a PostgreSQL server (Homebrew) or PGlite (the PostgreSQL engine as an npm package)
```

Principles: the server is the only source of truth; the client never decides access; every list/search/notification is filtered by the same permission engine; every write is idempotent or version-checked.

### Core data model (Phase 1–2)

`users, sessions, auth_tokens, profiles, education, institutions?, connections, platform_role_assignments, communities, community_settings, memberships (role + state), membership_requests, invitations, posts, comments, reactions, polls, events, event_registrations, resources, files, notifications, notification_prefs, reports, moderation_actions, deletion_requests, audit_log, feature_flags, platform_settings`

Phase 3 adds: `courses, course_staff, modules, lessons, enrolments, lesson_progress, quizzes, questions, attempts, assignments, submissions, grades, certificates`.

---

## 10. Decisions

| ID | Decision | Outcome |
| --- | --- | --- |
| **D1** | Backend stack | ✅ **Node.js + Fastify API, PostgreSQL everywhere** (local and production), SQL migrations. |
| **D2** | Modules outside the target IA (Tasks, Custom Apps, Web Tabs, Live, Town Halls, Channels, Surveys, Ideas, Leaderboard) | ✅ **Park behind feature flags.** Forums → Discussions, Files/Manuals → Resources, Town Halls → event type. Nothing deleted. |
| **D3** | Network-wide AlumniZone content | ✅ **Default "AlumniZone" Public community** owned by the alumni office; the platform becomes CommunityOne. |
| **D4** | Institutions, departments, batches | ✅ **First-class entities** (institution → department/programme → batch). |
| D5 | Email and hosting providers | Open. Default: emails written to the server log in development; choose a provider before the pilot. |
| D6 | Who is Super Admin | Open. Default: the alumni office account (Sara Thomas, seed `u7`). |
| D7 | Local PostgreSQL | Open: Homebrew PostgreSQL server, or PGlite (npm, no system install). |

## 11. Phased implementation plan

Each phase ends with its exit criteria **and** the edge cases assigned to it passing (see `EDGE_CASE_REGISTER.md`). P0s block the phase.

### Phase 1 — Core platform revamp and alumni experience
1. Server foundation: API server, DB + migrations, sessions, CSRF, rate limits, error handling, idempotency keys, audit log, permission engine skeleton, feature flags. Seed migration from the prototype data.
2. Authentication & account lifecycle: register, verify, sign in, reset, lockout, suspension (revokes sessions), deactivation, deletion with ownership checks. *(REG-01–18, USR-06, SYS-10)*
3. Profiles & alumni directory: education history, institutions/batches, privacy-aware directory search, server validation and sanitisation. *(USR-01–10)*
4. Connections, home feed, announcements, events foundation, member dashboard.
5. Platform administration: user management, institution/batch management, platform settings, audit history; Super Admin separation.
6. Client data layer: swap the reducer's persistence for API calls page by page; keep the UI.
7. Rebrand to **CommunityOne** across the UI, titles, metadata and docs.

### Phase 2 — Community expansion and engagement
Community entity + creation wizard; Public/Private/Closed; memberships, requests, invitations, roles; discussions, polls, pinned/announcements; events with registration, capacity, waitlist; resources with secure files; notifications (in-app + email) with preferences; moderation and reports; community dashboards and settings; Platform Admin override + Administrative Mode; deletion-request workflow; **basic Learning section** (courses, modules, lessons, enrolment, progress).
*(COM, VIS, MEM, PER, CNT, MOD, EVT, FIL, NTF, SRC, SET, DEL, LMS-01/03/06/08/13/14/15)*

### Phase 3 — Integrated learning
Assessments, question banks, assignments, grading, feedback, certificates with verification/revocation, Instructor/TA roles, course discussions, learning analytics, My Learning overview. *(LMS-*, ASM-*)*

### Phase 4 — Platform maturity
Advanced analytics and exports, integrations/API/webhooks, performance, monitoring, backups/restore drills, optional enterprise features. *(ANL, INT, SYS)*

### Phase 5 — AI
Re-enable Smart Assist and add permission-aware search, summaries and recommendations, only after Phases 1–4 are stable.

---

## 12. Test plan

- Every edge case in the register gets a test ID, phase, and status (Not run / Pass / Fail / Blocked).
- **Server tests** (Node test runner) cover permission, uniqueness, idempotency, concurrency and lifecycle rules, using a role × community-type × membership-state matrix.
- **Browser tests** cover the user journeys and responsive layouts at 375 / 768 / 1280 px.
- A phase is complete only when its P0 cases pass and results are recorded in the register.

---

## 13. What happens next

On approval of §10, Phase 1 starts with the server foundation (step 1). Nothing in the existing prototype is deleted: it stays runnable until the new stack reaches parity, and every parked feature is kept behind a flag.

---

## 14. Progress log

### Phase 1 — steps 1–2 (10 Nov 2026)

Built:
- **Server** (`server/`): Fastify API on Node 24, PostgreSQL via PGlite locally (`DATABASE_URL` switches to a PostgreSQL server), SQL migrations, seed from the prototype data.
- **Security foundations:** HttpOnly session cookies (hash stored), per-request session + account-status check, double-submit CSRF, security headers/CSP, per-IP rate limits on auth, `no-store` on all API responses, idempotency keys for creates, optimistic-version settings with field allow-lists, append-only audit log.
- **Permission engine:** platform roles (Super Admin … Support Agent) with scoped permissions; only Super Admin grants Platform Admin or changes security settings; the last Super Admin can't be removed.
- **Account lifecycle:** register → confirm email → sign in; lockout; resend; forgot/reset (ends every session); change password (ends other sessions); change email (pending until confirmed); deactivate/reactivate; delete (anonymised, handover checks).
- **Admin API:** users list, suspend (ends sessions) / reactivate, approve/decline, platform roles, settings, audit log.
- **Web app:** sign-in, sign-up, invitation, confirm-email, reset and confirm-new-email pages use the API; the server is the authority for who is signed in (checked on load, on focus and on any 401); sign-in returns you to the page you were heading for.

Tested: 35 automated server tests (all pass); browser journeys for sign-in, return-to-page, sign-out, sign-up with double click, confirmation, reused links, revoked sessions, forgot/reset password, phone width. Register: 25 Pass, 1 Blocked (REG-15 awaits community ownership).

Bugs found and fixed while testing: a transaction deadlock in email confirmation; sign-out failing with a 500 (empty JSON body) and the UI then silently signing the person back in; framework client errors reported as 500s; the glass effect's font request blocked by the CSP.

Transitional (by design, until later Phase 1 steps): profiles, feed, groups and other features still use the in-browser data. Accounts created on the server get a matching directory entry in the browser where they confirm. Invitation pre-approval waits for server-side invitations (Phase 2). The admin UI still uses in-browser data; the admin API exists and is tested.

Security notes:
- `@fastify/static` is pinned to 10.1.9 (6 days old) instead of a 2-week-old release, because it fixes a moderate advisory (glob/minimatch).
- `react-router-dom` 6.x has a moderate advisory (open redirect via backslash in `<Link>`/`navigate`) fixed only in 7.x. The app builds its own internal links and validates `?next=` to internal paths; the upgrade is scheduled with the client data-layer work (step 6).

### Phase 1 — step 3 (10 Nov 2026)

Built:
- **Alumni structure** (migration 002): institutions → departments, education rows with graduation year (the batch), one primary education per member; experience; profiles with skills, birthday (month/day only), LinkedIn, mentoring, custom fields, contact visibility and directory visibility.
- **API:** directory search with filters (institution, department, batch, city, company, skill) and pagination; facets; profile view with privacy (contact details hidden unless shared; suspended/hidden members not found for members; deleted members resolve to a placeholder); versioned profile edits with plain-text cleaning and field allow-list; personal data export (password re-entry); institution and department admin with duplicate protection.
- **Migration:** prototype profiles moved into the new tables (34 profiles, 34 education records, 35 career entries, 5 departments under "The Institute"); blank profiles for accounts without one.
- **Web app:** People directory searches and pages on the server; profiles refresh from the server; Edit profile saves through the API with department chosen from the institution's list, sends only changed fields, and on a conflict loads the newer copy while keeping the member's edits; the whole directory syncs after sign-in so names and details match across the app.

Tested: 51 server tests (all pass); browser: directory (35 members, 24 per page, department filter), edit with validation, two-tab conflict keeping both changes, phone width.

Bugs found and fixed while testing: unknown fields were silently dropped instead of rejected (framework default); a retried edit after a conflict overwrote the other tab's change (twice: resending unchanged fields, then a baseline captured too late); missing build files were answered with index.html (blank page instead of the reload recovery); new build files weren't served until a restart.

### Phase 1 — step 4a (10 Nov 2026)

Step 4 is split: **4a** connections and blocks, **4b** community foundation + home feed + announcements (the feed needs server-side communities and memberships to decide who sees what), **4c** events foundation + member dashboard.

Built (4a): connections (request, accept, decline, cancel, remove; one record per pair; asking someone who already asked you accepts theirs; pending-request cap), blocks (remove any connection, stop requests both ways, hide each other in profiles and the directory, "not found" so blocks aren't revealed; blocking staff doesn't limit staff authority), and the "only my connections" contact privacy. Prototype follows migrated to accepted connections (8). People: Connect / Requested / Accept–Decline / Connected on profiles, a requests panel on the directory, blocking via the server.

Tested: 62 server tests; browser: request → accept from the panel → connected; connections-only email visible to a connection, hidden from a non-connection; block and unblock with directory effect.

Bugs found and fixed: the connections list was always empty (two columns named `status` in one query; the existing test passed only because it checked absence); the app's "Only me" privacy value didn't match the server's (would have been rejected on save).

Process note: I ran a migration against the preview database while believing its server was still running. The server had in fact been stopped; integrity checked (all rows and migrations intact). Rule from now on: stop the server before migrating a PGlite database.

### Phase 1 — step 4b, server side (10 Nov 2026)

4b is split again: **server** (this entry) and **web app** (next: Feed and Groups screens switch to the API). The prototype feed has polls, moods, Mandatory Read, drafts and scheduling, so the server supports all of them first to avoid taking features away.

Built (migration 004):
- **Communities** (Public / Private / Closed, active / archived / suspended, settings), **memberships** with roles (Owner, Admin, Moderator, Instructor, Teaching Assistant, Member) and states (active, pending, invited, restricted, removed, blocked, left); at most one active owner, enforced by the database.
- **One access function** for every community/post route: account → community status → visibility → membership state → role → settings.
- **Administrative mode**: platform staff with community authority can open any community (including Closed) only when they ask for it (`x-admin-mode: 1`); no membership is created, counts are unchanged, every use is audited.
- **Membership API**: discover (Closed hidden from outsiders), join (Public instant, Private request, Closed invitation-only), leave/withdraw, approve/decline (state-checked, one outcome), role and state changes within your rank, atomic ownership transfer, owner/last-admin protection.
- **Content API**: home and community feed with cursor paging; posts (post/announcement/question/poll), drafts, scheduling (+ idempotent publish job), approval queues, author-only edits with version check, removal with reason, pin, soft delete; comments with reply threads and deleted placeholders; one like + one mood per member; polls with one changeable vote; Mandatory Read acknowledgements; blocked authors hidden.
- **Account deletion** now also requires transferring community ownership (REG-15).
- **Migration**: groups → communities (same ids; public→Public, restricted→Private, private→Closed) with roles and pending requests; network content → a public "AlumniZone" community (34 members, owner Sara); 9 posts, 5 comments, 24 reactions, 3 poll votes, 2 acknowledgements.

Tested: 91 server tests (all pass). Not yet visible in the web app — the Feed and Groups screens still read the browser data until the next step.

Found while building: a PostgreSQL type-inference error when one parameter is used twice (fixed with explicit casts); test-order leakage after an ownership transfer (tests corrected). Open question for later: the old "All Hands" group (g0) now duplicates the AlumniZone community's membership — candidates to merge.

### Phase 1 — step 4b, web app (10 Nov 2026)

Built:
- **Server additions:** create community (idempotent, near-duplicate names refused), versioned edit with a settings allow-list, admin add-members (rule-based adds never re-add people who left), archive/restore, platform-only delete (community admins get "archive" instead, DEL-01), restricted/removed members listed for moderators, archived communities listed for their members, pending requests re-evaluated on visibility change.
- **Groups & Spaces** (`src/lib/communities.js`, groups components): every action goes to the API — create, edit, settings, dashboard, join/request/cancel, leave, approve/decline, add members, roles, restrict/remove, transfer ownership (new), archive/restore; platform-staff delete with typed-name confirmation. Labels now read Public / Private / Closed. Communities sync after sign-in; groups you can't see are dropped locally.
- **Feed** (`src/lib/feed.js`, feed components): every view reads the server; composer posts to your communities (announcements, pins and Mandatory Read only where you're admin); likes, moods, votes, acknowledgements, comments, replies, edit, pin, approve, remove, delete via the API.
- Features the server doesn't support yet are hidden rather than faked: attachments (note shown), reposts/sharing to a community, social advocacy, Smart Assist (parked), post insights, report post, answer upvotes/best answer, editing a Mandatory Read after posting and its report/reminders.
- `canSeeGroupItem` now matches the server (Private and Closed are members-only; platform admins use administrative mode).

Tested: 99 server tests; browser: feed from server, post to AlumniZone (double click → one post), like + mood + comment (double click → one comment) persisting after reload, Groups: closed group not found, join public, request private, owner approves, new member sees content; phone width across 12 screens.

Bugs found and fixed: the "my communities" cache survived switching accounts in the same tab (next person saw the previous person's communities); "1 Comments" wording.

Still on local data (next steps): Dashboard widgets, search index, Admin → Moderation queue, the old scheduled-post and scheduler runners, signed-out Explore. Sync makes one request per community at sign-in and probes remembered ids (harmless 404s); to be simplified now that archived communities are listed.

Next: step 4c (events foundation and member dashboard on the server).

### Phase 1 — step 4c: events foundation and member dashboard (10 Nov 2026)

Built:
- **Events** (migration 005): events belong to a community and follow its visibility; they can also be invite-only within it. Times are stored as an instant plus the organiser's time zone. Co-hosts, guest lists, one RSVP per member (going / maybe / not going), capacity, RSVP deadline, cancel with a reason (the event and its RSVPs are kept), soft delete, comments.
- **Shared recurrence** (`shared/recurrence.js`): daily / weekly / monthly series keep the organiser's local time across daylight-saving changes. The server and the web app use the same code (`eventUtils.js` re-exports it).
- **API:** list by date range, community and view (all / mine / hosting); detail; create (idempotent); versioned edit by the host, co-hosts or community admins (only the host or admins change co-hosts); cancel; delete (host or admin); RSVP inside a locked transaction (capacity, cancelled, ended, RSVPs off, deadline); comments. Anything you may not see is "not found". Removed members' RSVPs stop counting at once. A community can keep open events to admins (`whoCanCreateEvents`; AlumniZone is set this way, matching the prototype's "company events" permission), while any member may still arrange an invite-only event.
- **Emails** to going/maybe registrants when an event is cancelled or its time or place changes (outbox templates `event_changed`, `event_cancelled`).
- **Member dashboard** `GET /api/dashboard`: my communities, the next 5 events I can see, unread Mandatory Reads, recent announcements, connection request count, new members, all with the same access and block rules as the full screens.
- **Migration:** 8 prototype events (network → AlumniZone, group → same community, private → invite-only in AlumniZone), 3 co-hosts, 1 invitee, 13 RSVPs, 3 comments. One RSVP was dropped because that person isn't a member of the event's community.
- **Web app:** Events (list, month/week, detail), Calendar, the group-space event widgets, the reminders runner and the Dashboard read and write through the API (`src/lib/events.js`). New fields: capacity and RSVP deadline. There's a cancel dialog with a reason, and "Full", "Cancelled" and "RSVPs closed" states. Controls follow the server's `can` flags. Attachments are hidden ("coming soon") until secure files arrive in Phase 2. Town halls, Tasks and Leaderboard widgets are hidden (D2).

Tested: 120 server tests (21 new in `server/test/events.test.js`), all pass. I also removed the capacity check and the invite-only filter on purpose to confirm EVT-02 and EVT-08 fail without them. Browser (fresh preview DB, member Ishita):
- events load from the server;
- RSVP double click → one request, one RSVP, kept after reload; comment double click → one comment;
- an invite-only event she isn't on shows "Event not found";
- dashboard shows her communities, events with her RSVP, announcements and a Mandatory Read; Acknowledge removes it;
- create in a group with a double click → one event with her browser's time zone; capacity 1 shows "1 of 1 places taken · Full"; cancel with a reason shows the banner and hides RSVP and Edit;
- phone width (375px): events, event detail, calendar, dashboard and group page have no sideways scroll.

Bugs found and fixed while testing:
- the dashboard was 580px wide on a phone (grid items couldn't shrink);
- editing an event without touching its times would have emailed registrants about a "change", because the form rounds times to the minute.

Not verified in the browser: the two-tab edit conflict (covered by a server test), and a second member seeing "Full" (server test).

Known gaps:
- RSVPs of people who leave stay stored (not counted) and count again if they rejoin.
- Communities don't expose `whoCanCreateEvents` in their list, so for groups the form relies on the server's message.
- No waitlist (overflow is refused; Phase 2).
- No in-app notifications for event changes (Phase 2).
- Explore (signed out), search, schedulers/workflows and the admin data export still read the old local events.
- The sidebar sits above modal backdrops at tablet/desktop widths (seen on the event form and cancel dialog; the shared Modal wasn't changed in this step, so this is likely older — to check in step 6).

Process note: the previous session's preview server was still running on its preview database when I migrated and seeded that database (it wasn't listed in this session's previews, and I didn't check the port first). I couldn't stop it from this session, so I left that database alone and tested on a fresh copy. The old database's integrity is unconfirmed: stop that server, then check it or re-seed with `--reset`. Rule reinforced: check `lsof -i :<port>` before migrating any preview database.

Next: Phase 1 step 5 (platform administration UI on the API).

### Hosting, email and the redesign brief (10–11 Nov 2026)

- **Hosting:** live on Catalyst AppSail (one service: API + web app). `npm run build:appsail` makes the upload zip with a ready-made database template; production refuses the published demo passwords (`SEED_PASSWORD`), requires `APP_ORIGIN` for email links, and never logs email bodies. Details and limits: HANDOFF.md › Hosting.
- **Email (D5):** Catalyst Mail via `MAIL_TRANSPORT=catalyst`; a confirmation email was received on the live site.
- **Found on the live site:** each redeploy starts with an empty database (the app folder isn't persistent), so a managed PostgreSQL is needed before real members.
- **Redesign brief** saved as `REDESIGN_BRIEF.md`; Stage 0 review (inventory, IA, journeys, design system, wireframes) approved with decisions R1–R8.

### Redesign Stage 1 — foundation (11 Nov 2026)

Built:
- **Tokens (R1, R2):** Inter only (Poppins dropped); solid surfaces with hairline borders instead of glass and blur; flat lime primary action with near-black text in both themes; no aurora glow or gradient type. The shared classes (`.glass`, `.btn`, `.input`) keep their names, so every screen restyled at once. The WebGL glass library, the "reduce effects" mode and the menu-visibility toggle are removed.
- **Icons (R3):** `Glyph` draws single outline icons in the text colour (no duotone tiles); new compass, create and plus icons.
- **App shell (R6):** desktop sidebar (Home, Explore, My Communities, Events, Create Community; your communities from the server; More: Feed, People, Calendar until they're re-homed; Platform Admin for staff; profile), top bar (search, Create menu: Event / Community / Post, notifications, account menu with theme), phone bottom bar (Home, Explore, Communities, Events, Profile). Home is now the default after sign-in.
- **Branding:** CommunityOne logo, page titles ("Home · CommunityOne"), metadata and platform-level copy; AlumniZone stays as the community's name ("Company Wall" → AlumniZone, "Company events" → AlumniZone events; Groups & Spaces → Communities wording).
- **Sign-in page:** no glass; the brief's headline; the invented statistics ("8,400+ alumni…") removed.

Tested: 125 server tests (all pass); browser: Home, Explore (opens Discover), Create menu → create-community form (Escape closes and clears the URL), Events sections, sign out → sign-in page; phone width 375 px on five screens (bottom bar, no sideways scroll); light mode.

Bugs found and fixed while testing:
- the sidebar's AlumniZone link (and the dashboard's, since 4c) led to "Group not found": AlumniZone isn't in the local group list, so its links now open its posts (`/feed/wall`) until Stage 3 gives every community a page;
- the current sidebar item was hard to tell apart from hover;
- single-word community names got one letter ("A" instead of "AZ").

Kept on purpose until later stages: notifications (still in-browser data), the old Explore page for signed-out visitors (Stage 2), group cover gradients and emoji community logos (Stage 3), admin "module order" settings (Stage 7).

### Redesign Stage 2 — public website (11 Nov 2026)

Built:
- **Public discovery (R7):** `GET /api/public/communities` (no sign-in, rate-limited): Public and Private active communities with category, description and a member count of active accounts; categories only from listed communities; upcoming open events for Public communities only (repeating events at their next date). Never Closed, archived or suspended communities, member lists, emails or content.
- **Default community (R5):** an account joins AlumniZone when it becomes active (email confirmed, or approved by an admin when approval is on). Someone who left, was removed or blocked is never re-added.
- **Public site:** new landing page on real data (hero, discovery cards with Join / Request to join, capabilities, how it works, AlumniZone featured with its real events, final CTA, footer); public Explore with search and category chips; About, Help and Support, and a factual Privacy page; Terms and Contact say honestly that the operating organisation hasn't published them yet. Shared header (phone menu) and footer. Signed-in visitors opening /explore go to Discover.
- **Intended destination:** a visitor's chosen community survives sign-up: it's kept in this browser for a day and used once after the email is confirmed (the confirmation usually opens in a new tab). Sign-in and sign-up tabs keep `?next=`; `?next=` now also rejects backslashes (the react-router open-redirect pattern).
- Sign-up copy is platform-level ("Create your CommunityOne account").

Tested: 132 server tests (7 new in `public.test.js`; mutation check: removing the Closed filter or the invite-only filter makes VIS-04 / EVT-08 fail). Browser: landing with real data and no console errors; every header/footer link resolves; How It Works scrolls; About/Help/Privacy/Terms/Contact/Explore each have one h1, a title and no overflow; Explore search; signed-out Join on Bengaluru Chapter → sign-up → confirmation link opened in a new tab → lands on Bengaluru Chapter, signed in, already an AlumniZone member, Home not empty; phone width with the header menu.

Bugs found and fixed while testing: Explore announced the whole result grid to screen readers on every keystroke (now only the count); page titles read "About CommunityOne · CommunityOne".

Not done / open:
- the Explore error state and "Try again" weren't exercised in the browser (SRC-06 stays Not run);
- Terms of Service and a contact address must come from the organisation running CommunityOne;
- "All Hands" still appears as a community until R4 (Stage 3);
- sign-up still asks for graduation year and department (alumni fields) — to revisit with onboarding in Stage 3;
- the account data export exists in the API but has no button yet.

### Redesign Stage 3 — core application (11 Nov 2026)

Built:
- **Community pages at `/c/:slug`** for every community, AlumniZone included (approved wireframe): header with tile, description, category, visibility and member count, Join / Request to join / Leave and an actions menu; tabs Overview, Discussions, Events, Members, About and Settings (admins only). Overview has the pinned post, the composer, recent discussions, upcoming events, members and About. People outside a Private community see only Overview and About with a members-only message. The page loads the community by slug or id from the server and reloads it after every change. Old addresses redirect: `/groups/:id(/:app)` → `/c/<slug>(/<tab>)`, `/feed/wall` → AlumniZone's Discussions. An id in the address is replaced by the slug.
- **All Hands merged into AlumniZone (R4), reversibly:** migration 006 adds `communities.merged_into` and `community_merges`. `lib/merge.js` moves posts and events, adds the source's active members who have no AlumniZone membership (never re-adding someone who left, MEM-05) and archives the source. Each merge records exactly what moved; `node server/scripts/undo-merge.mjs g0` moves back those posts and events and restores the old status (newer AlumniZone posts stay). The seed runs the merge once. A merged community is left out of every list and "my communities" loop; its address answers `404 MERGED` with the new home, and the page follows it.
- **Global search on the server:** `GET /api/search?q=&type=` across communities, people, events and posts, each with its own screen's rules (discovery, directory and blocks, the Events page, readable communities only), plus a second access check on posts. `%` and `_` are matched literally. The search page shows grouped results, filters, empty, error and retry states, and keeps the query in the address. The old browser-only search index and its saved-search alerts were removed.
- **My Communities and Explore** read the server's community list (AlumniZone now appears), with search, category chips, live result count and loading, error and empty states. The sidebar list and the composer's community list refresh after a join or leave.
- **Onboarding:** sign-up asks only for name, email and password. After confirming, a new member gets two optional steps (headline, job, company and city, saved to the server profile; then choosing communities), then continues to where they were heading. Finishing or skipping sets `users.onboarded_at`; existing and seeded accounts count as onboarded.
- **Profile** redesigned on server data only: header without the gradient cover, headline, work, education and city; Connect, Follow and Block; About, Experience, Education, Skills and Details; Posts tab. Points, levels, badges, praise, messages, reports and the activity list were stored only in one browser, so they were removed from the profile and the directory cards.
- Member counts agree everywhere (only active accounts counted).

Tested: 145 server tests (13 new in `core.test.js`: SRC-01/02/05/06, VIS-04, slugs, R4 merge and undo, onboarding, count agreement). Mutation checks: removing both post-visibility layers makes SRC-02/05 fail; removing the merged filter from the events query makes the merge test fail. Browser: `/groups/alumnizone` and `/groups/g0` land on AlumniZone; the community page matches the wireframe; Join from Explore updates the list, the tab count and the sidebar; search with results and with none; the redesigned profile; sign-up → confirm → welcome steps → join Mumbai Chapter → Finish lands on Mumbai Chapter as a member; reload keeps the member onboarded; a Private community seen from outside; phone width 375 px with no horizontal scroll.

Bugs found and fixed while testing:
- members of the merged All Hands got an error on Home, Events, the Feed and search, because "my communities" queries still included it; the test had missed it because a helper turned a failed response into an empty list (now status codes are checked);
- merge records got an `undefined_` id;
- member counts differed between pages (35 vs 34);
- the welcome list re-sorted under the pointer after a join;
- the profile link in step 1 led back to the welcome steps;
- the check-email screen was titled "Sign in".

Not done / open:
- the search error state wasn't triggered in the browser;
- recurring events in search show the series' first date;
- Home keeps its Stage 4c layout (emoji in the community list);
- Feed, People, Calendar and the older modules (forums, files, tasks…) aren't redesigned. Community pages no longer show the browser-only apps;
- Terms of Service and a contact address are still needed from the operator.

### Refined design system — step 1 (11 Nov 2026)

The user approved the refined designs (canvas page "Refined designs": system, Landing, Home, community overview, learning, Platform Admin, role views, tablet and phone). Step 1 puts the system in the code:

- **Tokens** (`src/styles/index.css`): four surface levels (sunken, band, surface, raised; only raised has a shadow), three text levels (16.6, 9.3 and 5.6:1 on the page), the type scale (`.t-display` … `.t-label`), and 44 px minimum buttons.
- **Community accents:** sky (AlumniZone), violet, amber, teal, rose and orange, all of equal lightness. They're stored in `communities.accent` (migration 007, with a check constraint, so lime can't be set). New communities get the least-used accent. They're returned by the community, list, search and dashboard endpoints. Measured contrast: accent text is 11.5–13.3:1 in dark mode and 6.5–7.4:1 in light mode; dark text on tiles is 9.1–11.2:1.
- **Screens:** community pages have an accent cover band, a 72 px tile, "A community on CommunityOne", and an accent tab underline (with no visible scrollbar on phones). Tiles in Explore, Search, Welcome, Landing, the sidebar and the dashboard use the community's accent.
- **Tests:** a new accent test covers the least-used pick, the value in every view, and the rejection of lime. 146 tests pass.
- **Browser:** Explore and the community page were checked in dark and light at desktop size, and at phone size (no horizontal scroll).
- **Not yet done:** the Landing, Home, community Overview and Platform Admin layouts from the refined boards.

### Refined design system — step 2: Landing and Home (11 Nov 2026)

- **Landing:**
  - Finding a community is the main action. The search box is the only primary button in the hero; the header's "Join free" and the card Join buttons are secondary.
  - Search and the category buttons open public Explore pre-filtered (`?q=`, `?category=`).
  - Next to the headline is a mosaic of real communities in their own colours.
  - A section shows AlumniZone as one community on CommunityOne, with a preview of its community page.
  - "Inside every community" is a keyboard-operable tab list. It holds only descriptions, no sample posts.
  - How it works has three steps, followed by a "Run a community?" band.
  - Cards show the next public event.
- **Home:**
  - One featured, raised item: replies to your posts first, then a Mandatory Read (acknowledged in place), then connection requests, then the next event. Up to two others sit beside it.
  - Below: New in your communities (a list, with each community named in its colour), Coming up (a timeline) and You might join (Public communities you're not in or waiting on; one-click Join).
  - Widget controls are removed.
- **Dashboard API:** `GET /dashboard` adds:
  - `replies`: other people's replies to your posts in the last 30 days, grouped by post, with blocks applied.
  - `recentPosts`: other people's posts in your communities, with like and reply counts.
  - `suggested`.
- **Tests:** 148 pass. New ones cover replies leaving out your own and blocked people's, What's new leaving out your own posts, and suggestions leaving out Private and Closed communities, your own, and ones you're waiting on. The public-card field list now includes `accent`.
- **Browser:**
  - Landing at 1280, 768 and 375 px with no horizontal scroll. Search went to `?q=mentor` (Mentorship Program), and City went to Bengaluru and Mumbai. The tab arrow keys work.
  - Home at 1280 (dark and light), 768 and 375 px. Join from You might join added Mentorship to the sidebar and its events to Coming up.
  - Not seen in the browser: the replies version of the featured item (covered by tests).

### Refined design system — step 3: community Overview and Platform Admin (11 Nov 2026)

- **Community Overview:**
  - Members who joined in the last 30 days and haven't posted yet see a welcome block in the community's colour, with the composer inside it. Everyone else sees the plain composer. The composer is held back until posts have loaded, so it doesn't flicker.
  - The pinned post or Mandatory Read is a band, and discussions are a list with avatars.
  - The next event is the one raised item, with RSVP buttons and the next two events after it. It sits beside discussions on desktop and above them on phones and tablets.
  - The People line says "Run by <owner> with <admins>".
  - The community colour now covers the whole page.
  - The community detail response gains `membership.joinedAt`.
- **RSVP buttons:** moved onto the refined system everywhere. Going is lime, your other choice is white, and the rest are secondary. They're 44 px tall.
- **Platform Admin:**
  - A new Overview tab, shown first, with live totals (accounts by status, communities by visibility, events, published posts), "Needs attention" (pending accounts, suspended communities), and recent audit activity for staff with `audit.view`.
  - A communities table with a text filter and a visibility filter. Rows become a list on phones. A Closed community the admin isn't in shows "Members only" instead of a link that would lead to "not found".
  - It's served by `GET /admin/overview`, which requires `analytics.platform` and leaves out merged communities.
  - The admin navigation uses the system's active style.
- **Tests:** 149 pass. A new test covers that a member gets 403, a User Manager gets 403, totals match SQL, a merged community isn't listed, and `canOpen` is right for Public and Closed communities.
- **Browser:**
  - Overview as Ishita at 1280 and 375 px: the welcome block, and RSVP Maybe then Going.
  - Admin as Neha at 1280 and 375 px: 36 accounts, 8 communities, 9 events, 7 posts. The Closed filter shows the two Closed communities, and there's no horizontal scroll.
- **Not built:** an Administrative Mode entry point in the client. The server supports it.

### New logo (11 Nov 2026)

- The user supplied the CommunityOne logo artwork: a lime-to-green "C" holding three people, the wordmark "CommunityOne" with "One" in lime, the tagline "One Platform. Every Community.", and a dark rounded-square app icon. I redrew it as SVG on a 64-unit grid.
- **`LogoMark`:** draws the people in the text colour, so the mark works in dark and light mode.
- **`Logo`:**
  - The wordmark is live text: "One" uses `brand-300`, so it stays readable in light mode.
  - It's used in the app sidebar, the mobile top bar, the public header and Welcome.
  - With the tagline, it's used on sign-in and in the public footer.
- **Favicon:** `public/favicon.svg` is now the app icon. It replaces the old "AZ" tile.
- **Browser:** checked at 16, 32, 64 and 160 px on dark and white backgrounds. Below 32 px the C still reads, but the people don't.

### Stage 3 loose ends and Administrative Mode (11 Nov 2026)

- **Search:** a repeating event is listed at its next occurrence, and results are sorted by that date. A new test covers a weekly series that started 20 days ago.
- **Seen in the browser:**
  - Search's error state: requests to `/api/search` were made to fail in the page. The page showed "Can’t reach CommunityOne…", and Try again recovered.
  - Home's "replies to you" featured item: Ishita replied to Neha's question, and Neha's Home showed it first with "Read and reply".
- **Administrative Mode in the client:**
  - Platform staff open `/c/:slug?admin=1` from the Admin → Overview table ("Admin Mode", or a row tap on phones for communities they can't otherwise open).
  - `src/lib/api.js` sends `x-admin-mode: 1` only for that community's own paths and `community=` filters (`setAdminScope`, widened to the resolved id once the server confirms admin mode). Background refreshes of other communities never carry it.
  - The page shows an amber banner ("You’re viewing … as platform staff… recorded in the activity log") with Exit. Tabs keep `?admin=1`.
  - Leaving Admin Mode re-mounts the page, so nothing loaded as staff stays on screen.
  - Checked: Neha opened the Closed community Class of 2016. Without `?admin=1` it says "Community not found"; with it, the full page and the banner show. Exit returns to "not found". The activity log shows `admin_mode.access` for g1 only.
  - Not covered: opening a post from that page leaves Admin Mode, so a Closed community's post opens only for members.

### Role views (11 Nov 2026)

`src/components/groups/RolePanel.jsx` adds a role panel at the top of a community's Overview. Each role opens on its own first job:

- **Owner:**
  - "Your community": Members, Joined in 30 days, Posts in 30 days.
  - A setup checklist: description, guidelines, first members, first event, pinned welcome post. Each step links to where it's done, and the checklist disappears when everything is done.
  - The decision queue appears below it only when something is waiting.
- **Admin:** "Waiting for a decision", with Join requests and Posts to approve as tabs. Requests show the person's message and have Approve and Decline.
- **Moderator:**
  - A review queue in a split view: held posts on the left, the selected post in full on the right.
  - Remove needs a reason the author sees. "Approve and publish" is the one primary action.
  - Reported posts join the queue in Stage 6.
- **Instructor:** comes with Learning in Stage 5.
- **Server:** new `GET /communities/:id/health` (community admins only), returning `joined30`, `posts30`, `events`, `pinned`, `pendingPosts` and `restricted`.
- **Welcome block:** now shown only to plain members, not to owners, admins or moderators.
- **Tests:** 151 pass (new: health is admins-only and its numbers match the data).
- **Browser, using a scratch community "Preview Review Circle" in the preview copy:**
  - Neha (owner) saw her numbers and a 1-of-5 checklist, then approved Ishita's request (members 2, checklist 2 of 5).
  - She approved one held post (it moved to Recent discussions) and removed the other with a reason.
  - Ishita, made a moderator, saw the review queue at 375 px with no horizontal scroll.

### Feed, People and Calendar restyled (11 Nov 2026)

- **Shared components:** `PageHeader` uses the H1 scale and secondary text. `Tabs` is an underline tab row with lime for the active tab. These are used by about 19 older screens.
- **Text colours:** Feed, People, Calendar and their components use the system's three text levels instead of Tailwind `slate`, which is blue-tinted next to the graphite palette (92 classes swapped).
- **Feed:**
  - The view list uses the system's active style, and headings use the type scale.
  - A post names its community in that community's colour. Posts now carry the community's `slug` and `accent`.
- **People:**
  - Follow is secondary. A directory shows one per person, so a lime Follow put dozens of primary buttons on one screen.
  - The filter labels are fixed ("All batches", "All cities", "All companies").
  - On phones the filters fold behind a Filters button.
- **Calendar:** "Task due dates" is gone, because Tasks are parked (decision D2). The view switch and filters use the system.
- **Checked:** 151 tests pass. All three screens at 1280 and 375 px with no horizontal scroll and no console errors. The People filters open and close on a phone.

### Stage 4 boards redrawn (11 Nov 2026)

- **What changed:** the eight Stage 4 boards on the design canvas (page "Stage 4") now use the refined system.
  - The layout matches the R1 boards: side navigation, breadcrumbs, AlumniZone in sky with sky tab underlines.
  - Lists, tables and timelines replace the uniform cards, and each screen has one raised item.
  - The six approved decisions appear as settled notes ("Approved 11 Nov 2026" on S4Plan). Attachments show "Images and PDFs, up to 4 per post, 10 MB each", and FIL-04 is noted as a known gap on Resources.
- **Checked:** every board was screenshotted and reviewed. Corrected: the member count (34, the seeded active count) and Sara Thomas's role (Alumni Relations Lead).
- **Still on the old mark:** the boards show the "C1" tile, not the new logo.
- **Waiting on:** the user's approval of these boards before Stage 4 is built.

### Redesign Stage 4 — engagement (11 Nov 2026)

The boards (refined style) were approved, along with decisions S4-1 to S4-6. Migration `008_engagement.sql` holds all of Stage 4's tables.

- **Files** (`server/lib/files.js`, `server/routes/resources.js`):
  - Stored in the database, up to 10 MB each.
  - The type is decided from the bytes, and only safe types are accepted (PDF, PNG/JPEG/GIF/WebP, docx/xlsx/pptx, plain text). SVG and HTML are refused.
  - Uploads are idempotent.
  - Every download re-checks community access and is served as an attachment with `nosniff` and a sandbox CSP.
- **Resources tab** (`src/components/groups/Resources.jsx`):
  - Links and files with search, categories and sort.
  - Admins add resources, or members do when the community setting `membersAddResources` is on.
  - Edits are version-checked. Replacing a file keeps the link.
  - Resources belong to the community, not to whoever added them.
- **Discussions tab** (`src/components/groups/Discussions.jsx`, `server/routes/topics.js`):
  - Filters for All, Announcements, Questions and Polls.
  - Topics: admins keep up to 12, and members filter by them.
  - Search inside the community, and sorting by Newest or Most active.
  - The composer attaches images and PDFs (up to 4) and picks a topic. Posts show both.
- **Notifications** (`server/lib/notify.js`, `server/routes/notifications.js`, `src/pages/Notifications.jsx`):
  - Created by the server for replies, mentions, announcements, join requests and decisions, moderation, event changes and waitlist places.
  - Once per action and person, never to the actor, blocked pairs or inactive accounts.
  - Rebuilt on read with an access check.
  - Email settings per category, with defaults. Emails never quote content.
  - The bell shows the server's unread count.
- **Saved** (`src/pages/Saved.jsx`):
  - Posts, events and resources are saved on the account.
  - Items you can no longer open stay listed as "No longer available".
  - Browser-only bookmarks move to the account the first time Saved opens.
  - Post menus say Save.
- **Events:**
  - A full event offers "Join waitlist" and shows your place in line. Places that open, or are added by a capacity increase, go to the first in line who still counts (EVT-09).
  - Event changes and cancellations also create in-app notices.
- **Members tab:** search by name, job, company or city; a role filter; join dates.
- **Tests:** 174 pass (23 new in `server/test/stage4.test.js`). The register is updated: FIL-01 to FIL-10, NTF-01/02/06/07/09/10, CNT-12, CNT-15 and EVT-09 pass; FIL-04 is an accepted gap; NTF-03 is partial.
- **Browser** (scratch community "Preview Review Circle" in the preview copy):
  - Upload and download a resource.
  - Topics and a post with an image attachment, then the topic filter and Most active.
  - Ishita's reply showed up as Neha's notification; opening it went to the post and cleared the bell.
  - Saving a post put it in Saved.
  - The Members role filter showed the 3 admins with join dates.
- **Not seen in the browser:** the waitlist buttons (covered by server tests), and phone sizes for the new tabs.
- **Open:**
  - No automatic retry for failed emails (NTF-03).
  - No reminders before events (NTF-04).
  - A removed member's place isn't released to the waitlist until the next RSVP change.

### Stage 4 checks: waitlist and phone sizes (11 Nov 2026)

- **Waitlist, end to end in the browser:**
  - Neha took the only place at a 1-seat event. Ishita saw "Join waitlist" with "This event is full".
  - After joining, she saw "You're number 1 on the waitlist…" and "Leave waitlist".
  - When Neha gave up her place, Ishita became Going and got "A place opened up…" linking to the event.
- **Phone (375 px), no horizontal scroll:** Discussions (filter and topic chips scroll sideways), Resources (list rows with Download and Save), Members (search and role filter stack), Notifications (list and email settings), Saved, and the event page.
- **Bug found and fixed:** going from one community straight to a different community on a different tab drew the old community's data under the new address for a moment. Its address fix-up then sent you back to the old community. The page now keeps track of which address its data belongs to, and shows the loading state until the new community arrives.
- **Gap found and fixed:** Saved said "Use Save on a post, event or resource", but only posts had Save. Events (next to Copy link) and resources (each row) now have a Save / ✓ Saved button. Both were checked in the browser.


### Redesign Stage 5a — learning (12 Nov 2026)

Built to the approved boards (design canvas page "Stage 5 — Learning") and decisions D1–D8.

- **Server** (`009_learning.sql`, `routes/learning.js`, 13 tests):
  - Courses, modules, lessons, enrolment with capacity and waitlist, and progress.
  - The test run used to hang. Enrol called `loadCourse`, which queries through `db`, inside `db.tx`, and PGlite's single connection deadlocked. Permissions are now checked before the transaction, and only `t` is used inside it.
  - **Bug found by the tests:** completion counted no lessons once a course was finished. `countedFor` read `created_at` from outline rows that use `createdAt`.
  - `GET /lessons/:id` now also returns the community, and `missingFiles` (files deleted from the store since), for LMS-10.
- **Client:**
  - The Learning tab (`components/learning/Catalogue.jsx`): Continue where you left off, search, category, sort, status chips. Phones get list rows.
  - The course page (`CoursePage.jsx`): outline, What you'll learn, requirements, enrolment box with Enrol, Join waitlist, Leave, and Join the community.
  - The builder (`Builder.jsx`): modules and lessons with Move up/down, the lesson editor with uploads, Instructors, settings, and publish, unpublish, archive and delete. Not offered on phones.
  - The lesson viewer (`pages/Lesson.jsx`): outline rail, focus mode on phones, file rows with Try again.
  - My Learning (`pages/MyLearning.jsx`), the sidebar item, and the Learning card on Home.
  - Course URLs are `/c/:slug/learning/:course[/edit]`; lessons are `/lessons/:id`.
- **Browser, 1280 and 375 px:**
  - **Admin (Sara):** created a course (double-click made one), added a lesson, moved a lesson across modules, published.
  - **Member (Ishita):** lesson URL refused before enrolling; enrolled with a double-click (one enrolment); completed all three lessons; the course completed and My Learning listed it.
  - **Priya:** Continue card and the Home Learning card.
  - **Karthik:** the full course offered Join waitlist, then Leave waitlist.
  - **LMS-10:** a forced download failure showed "This file didn't load." with Try again.
  - **Phone:** no sideways scroll; the lesson hides the bottom bar and pins its action.
  - **Fixed while checking:** the current lesson's circle in the outline was invisible, and Continue lesson wrapped onto its own line.
- **Also fixed:** `npm run db:seed` crashed because the `ACCENT` table was defined after the code that runs on load. The server's own startup seed wasn't affected.
- **Not built:**
  - Lesson questions ("Ask a question"): there is no server for them yet.
  - "Choose from AlumniZone files": the server only accepts files the editor uploads.
  - The B / I / H text toolbar: lessons are plain text with `##` headings and `-` lists instead.
  - The Instructor frame in RolePanel (optional).
  - Drag to reorder: only Move up and Move down.
- **Not checked in the browser:** LMS-04 and LMS-09 (both covered by server tests), and the builder's phone message as an admin.

### Redesign Stage 5b — assessment (12 Nov 2026)

Built to the approved boards (S5Quiz, S5Grading, S5Certificate) and decisions D7–D8.

- **Server** (`010_assessment.sql`, `routes/assessment.js`, 20 tests):
  - Quizzes and assignments are two new lesson kinds, so they appear in the outline and count towards completion like any lesson.
  - Their progress row is written only when they're passed, and "Mark complete" refuses them.
  - The certificate is issued in the same step that completes the course.
  - **Quizzes:** attempts keep their own copy of the questions; there's one open attempt at a time, and starting again resumes it; the limit is counted under a lock; the deadline is checked on the server; submitting is idempotent; right answers are revealed only after a pass or with no attempts left.
  - **Assignments:** text and/or up to 5 files; late work is marked late. Grading takes a 30-minute lock, with Save draft and Return to learner.
  - **Certificates:** codes avoid 0/O and 1/I; names are copied in; a public `GET /certificates/:code` returns only name, course, community, date and code.
  - **Notifications:** new "Your courses" category, with work returned and certificate earned.
  - Courses completed in 5a get their certificates from the migration.
- **Client:**
  - `components/learning/Quiz.jsx`: summary, attempt with question navigation and save-as-you-go, result and review.
  - `Assignment.jsx`: send work, see the grade and feedback.
  - `Grading.jsx` (`/c/:slug/learning/grading`): queue with lock states, plus a "Work to grade" card in the catalogue.
  - Builder: Quiz and Assignment kinds, their settings, and a question editor.
  - `pages/Verify.jsx` (`/verify/:code`): public, prints as PDF.
  - My Learning: a Certificates section.
- **Browser, 1280 and 375 px:**
  - **Sara:** built a quiz in the builder (a question without a right answer was caught) and graded Priya's work (the row and panel showed "You're grading"; the queue emptied).
  - **Priya:** answered, reloaded, and the attempt resumed with the answer kept; failed (0 of 2, answers hidden); passed on attempt 2 (review shows right answers); sent the assignment; saw "8 of 10 · Passed" with the feedback; finished the course; got the certificate and both notifications.
  - **Signed out at 375 px:** the verify page showed the certificate, with no sideways scroll; a made-up code was refused.
  - **Ishita:** her 5a completion got a backfilled certificate.
- **Fixed while checking:**
  - The return route used the grader's id before it was set (a 500, caught by the tests).
  - The lesson type buttons overflowed in the builder.
  - "Next lesson" competed with Start quiz as a second main button.
  - Backfilled codes could contain 0 or 1.
- **Not built, or limits:**
  - No certificate revoke action (the page can show "withdrawn").
  - No rubrics.
  - No grace period on quiz deadlines.
  - "Download PDF" is the browser's print.
  - A published course can gain an empty quiz; publish checks only at publish time, and learners see "no questions yet".
  - The grading lock between two instructors is covered by tests, not checked in the browser.
- **Seen, not changed:** signing in through `/login?next=…` while already signed in goes to Home, not to `next`.

### Redesign Stage 6 — community management (12 Nov 2026)

Built to the approved boards (design canvas page "Stage 6 — Management") and decisions D1–D8, approved by the user on 12 Nov.

- **Server** (`011_moderation.sql`, `routes/moderation.js`, `routes/manage.js`, 20 tests; full suite 230):
  - **Reports and cases:** reports on posts, replies, events and members join one case per item, with a snapshot taken at the first report. Who reviews follows D1. Reporters are numbered, never named.
  - **Reviewing:** opening a case takes a 30-minute lock that stops counting if its holder loses the role.
  - **Decisions (D3):** dismiss, remove (restorable 30 days), warn, restrict (1/7/30 days or until lifted; lifts on its own through the job runner), remove from community, block. Each needs a reason, is recorded in the case history, and notifies the person and the reporters.
  - **Appeals (D4):** one per decision, within 14 days, decided by an Owner or Admin who didn't take the action; overturning undoes it.
  - **Members:** sanction and lift from the members list, with rank rules. Removed members can ask again after 7 days.
  - **Deletion requests (D6):** Owners only, with the name typed to confirm.
  - **Analytics (D7):** computed live from complete days, rather than nightly stats rows. Bounded to 90 days per community, the result is the same with less to keep in sync.
- **Client:**
  - **Manage tab** (`components/manage/Manage.jsx`, `/c/:slug/manage/:section`): Overview, Queue (reports, held posts, join requests, appeals, decided), Members (`ManageMembers.jsx`), Analytics (`Analytics.jsx`), Settings with Danger Zone. Owners open on Overview; Admins and Moderators on the Queue.
  - **Report dialog** (`Report.jsx`) on posts, replies, events and Members-tab rows.
  - **Notice page** (`pages/Notice.jsx`, `/notices/:id`) with the appeal form.
  - **Settings:** the brief's section names with locked platform rows and an unsaved-changes bar. The old `/settings` addresses move to Manage → Settings.
  - The Members tab is now a directory; staff manage people from Manage → Members.
- **Browser, 1280 and 375 px:**
  - **Report and decide:** Priya reported Karthik's post from its menu, and Ishita reported it too; Sara saw one case with both reports, "as reported" and "now", and removed it with a warning and a reason.
  - **Notice and appeal:** Karthik got the notification and the notice page, and appealed. The appeal reached Aisha, not Sara; Aisha undid it on a phone and the post came back.
  - **Members, analytics, settings:** Aisha restricted Rohan for 7 days ("Restricted until 19 Nov"). Analytics showed real figures. The Settings unsaved bar appeared, and Sara sent a deletion request (withdrawn through the API afterwards).
- **Fixed while checking:**
  - Settings crashed for AlumniZone, because it stores no module list. The crash was already there before Stage 6.
  - The queue counts didn't refresh after a decision.
  - Old addresses like `/settings` weren't rewritten to the new address.
- **Not built or limits:**
  - Settings sections for Branding, Roles and permissions, Learning, Events and resources, and Notifications.
  - Invitations (MEM-11/12/14).
  - Members CSV export.
  - Report on the profile page (it's on Members-tab rows) and on event comments.
  - A notice page for sanctions applied from the Members list (the in-app line only).
  - Withdrawing a deletion request through its confirm dialog wasn't clicked in the browser (covered by tests).
  - Stage 7 handles deciding deletion requests, the moderation centre (reports about Owners, appeals no one can decide) and MOD-10 exports.

### Redesign Stage 7 — platform administration (12 Nov 2026)

Built to the approved boards (design canvas page "Stage 7 — Platform administration") and decisions D1–D8, approved by the user on 12 Nov.

- **Server** (`012_platform.sql`, `routes/platform.js`, additions to `routes/admin.js` and `routes/moderation.js`, 23 tests in `server/test/platform.test.js`):
  - **Users:** search with status filters (waiting, suspended, restricted in a community, deactivated) and role filters, 25 per page. A person's panel lists their communities (with any restriction), active sessions and reports about them. Sign out everywhere. Suspension emails the reason (D3). Losing a platform role ends that person's sessions. Nobody changes their own platform role (PER-02).
  - **Password again (D4):** `sessions.password_at` is set at sign-in and by `POST /admin/confirm-password`. Granting Super Admin or Platform Admin, approving a deletion, deleting directly and exporting the activity log need it within 10 minutes (`PASSWORD_REQUIRED` otherwise).
  - **Communities:** filters (all, deletion requests, no active Owner, suspended, archived, deleted and restorable). A panel shows staff, counts and what deleting affects. Suspend: the community is hidden from everyone but its own staff, who can read it but not change it. A new Owner can be set when there's no active one (COM-08); the old Owner becomes Admin, since a community has one Owner.
  - **Deletion (D1, D2):** opening a request takes it for 30 minutes (DEL-15). Approving needs the name typed, a note and a fresh password, and is refused while reports or appeals are open (DEL-09). Platform Admins can also delete without a request. A deleted community is `status = 'deleted'`: it's 404 `COMMUNITY_REMOVED` for everyone and gone from every list. It can be restored for 30 days, memberships included. After that, `purgeDeletedCommunities` (job runner) removes it in steps that resume (files, posts, then the row). A tombstone in `removed_communities` keeps old links saying "removed". Certificates keep verifying. AlumniZone (the default community) can't be deleted or suspended.
  - **Moderation centre (D5):** reports about Owners, cases escalated by an Owner or Admin (`POST /cases/:id/escalate`), reports open 7 days where no Owner, Admin or Moderator has signed in for 7 days, and appeals nobody in the community can decide. Platform Admins decide through the Stage 6 routes in Administrative Mode. A Platform Admin who holds a staff role there or took part is refused (`CONFLICTED`, MOD-06). Owners get a day-3 reminder (`remindStaleReports`).
  - **Settings (D8):** new sections `files` (largest file 5 or 10 MB, allowed types; new uploads only) and `communities` (who can create). Feature switches are edited in place; Smart Assist can't be turned on.
  - **Announcements (D7):** one at a time, to everyone or to members of chosen communities, in-app links only, an end date, and dismissal per person.
  - **Activity log and analytics (D6):** filters (who, community, dates, kind), pagination, and a CSV that needs the password and is itself logged. Platform analytics count people and memberships separately and fold small numbers (under 5). Users, activity and analytics exports are all logged.
- **Client:**
  - `src/pages/Admin.jsx` follows the board: Overview, Users, Communities, Moderation centre, Activity log, Analytics, then Platform: Settings, Roles and permissions, Announcements, Institutions.
  - New screens are in `src/components/platform/`; shared helpers (`PasswordGateProvider`, `downloadCsv`) are in `src/lib/platform.js`.
  - The old browser-data Members, Moderation and Analytics screens are removed. The other older screens stay under "Older tools · this browser only", labelled as such.
  - Home shows the announcement bar. The Stage 6 case view has "Send to CommunityOne…" for Owners and Admins.
  - `api()` takes `adminMode: true` for one request.
- **Browser, 1024 and 375 px** (preview copy on port 5184):
  - **Users:** Sara suspended Harsh Patel with a reason; the list showed "Suspended · 1". She then reactivated him. The activity log shows both, naming him.
  - **Delete and restore:** Sara deleted Mumbai Chapter directly; `GET /communities/mumbai-chapter` answered 404 `COMMUNITY_REMOVED`. She restored it; it was back to 200 and active.
  - **Other screens:** the moderation centre, activity log and analytics rendered real data.
  - **Announcement:** published from Administration, shown above the greeting on Home, dismissed, and stayed gone.
  - **Phone width:** no horizontal overflow on Users at 375 px.
- **Fixed while checking:**
  - Communities have no `updated_at` column.
  - Assigning an Owner hit the one-Owner constraint.
  - "Back to the app" went to the Feed instead of Home.
- **Not checked in the browser** (covered by tests): the password prompt dialog itself (Sara's sign-in was always fresh), approving or declining a request from an Owner, deciding cases from the centre, and CSV downloads.
- **Not built or limits:**
  - Moderation and Notifications settings sections, and a Learning section beyond the module switch.
  - A cross-community Learning screen in Administration.
  - Custom platform roles.
  - Notifications about a community that was removed for good disappear with it, because their rows cascade.
  - The conflict rule counts staff roles, not plain membership: every account is a member of AlumniZone, so the stricter reading would block everyone there.

### v2 brief — workstream A: architecture and data (12 Nov 2026)

The proposal (`PROPOSAL_V2.md`) was approved with the recommended answers to P1–P5.

- **No default community.**
  - Email confirmation and account approval no longer add anyone to AlumniZone. `joinDefaultCommunity` and `DEFAULT_COMMUNITY` are gone.
  - AlumniZone can be suspended or deleted like any community, and sky is an accent any community can get.
  - In the client, the "network" community is gone:
    - `NETWORK_ID` and `NETWORK_COMMUNITY` are removed.
    - The Feed's "wall" now redirects to `/feed`.
    - The Composer defaults to your first community.
    - Events lose the "All of AlumniZone" scope and the AlumniZone tab.
    - AlumniZone is listed with the other groups, and no longer pinned first in My Communities or on Landing.
    - Landing's AlumniZone section is removed.
    - About and Welcome are reworded.
- **P1 data migration.** `013_data_migrations.sql` adds `data_migrations` and `migration_log`.
  - `lib/data-migrations.js` `retireDefaultCommunity` runs once from the seed. Owners, Admins, Moderators, Instructors and TAs keep their memberships, as does anyone who posted, replied, reacted, voted, acknowledged, hosted or went to an event, or enrolled. Everyone else becomes "left" and can rejoin in one click. Every change is logged.
  - `server/scripts/undo-data-migration.mjs` undoes it, restoring only rows still as P1 left them.
  - **Rehearsed** on a copy of the preview database. Before: 34 active memberships, 6 posts, 3 events. After: 10 kept (4 staff, 6 who took part), 24 left, 6 posts, 3 events, 24 log rows. Undo restored all 24.
- **Feature flags enforced (P4).**
  - `014_module_flags.sql` adds switches for Forums, Files, Manuals and Org chart.
  - `GET /api/features` returns the switches; `src/lib/features.js` reads them.
  - A parked module's routes exist only while its switch is on (`flag` in `lib/modules.js`), for admins too.
  - Learning off: learning routes answer 404 `LEARNING_OFF` (certificates still verify); the Learning tab and My Learning disappear.
- **Bug found by the new browser tests and fixed.** The email confirmation link (`#/verify?token=…`) opened the certificate check page. Stage 5b had registered `/verify` ahead of the email page. `/verify` now opens email confirmation when there's a token, and the certificate check otherwise.
- **Playwright (P3).**
  - Added `@playwright/test` 1.64.1; it uses the installed Google Chrome, so no browser download.
  - `npm run test:e2e` builds and starts the server on a throwaway seeded database (`e2e/start-server.mjs`).
  - Journeys at 1280 and 375 px: sign up, confirm and start with no communities; join a Public community and post; Platform Admin deletes and restores a community. Result: 5 passed, 1 skipped (admin journey at desktop only).
- **Server tests:** 253 pass in two full runs (113 s and 169 s), with no stall. Earlier stalls all happened while another test run or a build ran at the same time. Not reproduced, so not fixed: if it comes back, run the files one at a time.
- **Browser** (preview, port 5184):
  - `/forums` no longer opens.
  - `/api/features` lists every parked module as off.
  - Switching Learning off removed every Learning link and sent `/c/alumnizone/learning` to the Overview; it was switched back on afterwards.
- **Not done here** (later workstreams):
  - Emoji and theme (B).
  - Landing redesign, which is still the old layout without the AlumniZone section (C).
  - Moving batch filters into Alumni-template communities (F).
  - The seed still creates the prototype's AlumniZone from old data. P1 trims it; workstream F replaces it with a template-made demo community.

### v2 brief — workstream B: design system foundation (12 Nov 2026)

The board was approved with B1–B5 (canvas page "v2 — Design system").

- **Tokens:**
  - `src/styles/index.css` now defaults to light, with dark as an option. It uses the board's values: secondary text `#5F6B66` (B1), the accent pair `#168C70` / `#127A61` (B2), and the form-control border `#808B85` (B3).
  - New semantic tokens: `--az-page`, `--az-control`, and danger, warning, ok and info, each with a soft background.
  - The old Tailwind `brand` scale now maps to the teal accent, so screens not yet restyled pick up the palette.
  - `lib/theme.js` and `index.html` default to light; the stored "dark" and "system" choices are kept.
  - `light-invert.css` stays until every screen uses the components (end of workstream G). This is a planned deviation from B4's "removed".
- **Icons (B5):**
  - `lucide-react` 1.61.0, pinned. `components/icons.jsx` maps the app's icon names to Lucide.
  - `Glyph` never draws an emoji; an unmapped one shows a neutral shape.
  - Emoji in source went from 497 to 11 lines in parked modules, plus the translation table in `icons.jsx` (for emoji still stored in old data).
  - Done on reachable screens: icon values became icon names, labels lost their emoji prefixes, and like, mood, badge and celebration icons are drawn with Lucide.
  - Removed: the community emoji picker (uploaded logos arrive in workstream E), emoji in labels such as event selects, and emoji in seed and demo text.
  - The logo's "C" is now solid `#168C70` instead of the lime gradient, and the favicon is light. That changes your own artwork, so it's easy to undo.
- **Components:**
  - `src/components/ui/Controls.jsx`: Button, IconButton, Badge, Skeleton, Stat.
  - `src/components/ui/Confirm.jsx`: `confirmAction()` and `ConfirmHost`, mounted in `App.jsx`. The confirm button takes the sentence's first verb; destructive verbs make it red.
  - All 31 `confirm()` calls on reachable screens now use it; the 23 in parked modules are untouched.
- **Checked:**
  - Build passes.
  - Playwright (`npm run test:e2e`): 7 passed, 1 skipped. Includes a new journey checking that the app is light by default (body `#F7F8F6`) and that Home, Feed, Events, Communities and Admin show no emoji text.
  - Server tests: 253 pass when the files run one at a time. The single full-suite command stalled again, in `assessment.test.js`, which passed 3 of 3 on its own. The stall is intermittent and still unexplained.
- **Not done here:**
  - Restyling each screen onto the components (workstreams C–G).
  - The 1,617 hardcoded colour classes.
  - Emoji in the parked modules.

### v2 — Intermittent test-runner stall (built in parallel, 12 Nov 2026)

- **Cause found.** Every stalled run stopped inside `createDb()`, while PGlite was still starting and before the first query. It's a deadlock in Node 23.11 itself, not in our routes or tests:
  - PGlite's WebAssembly start-up holds no libuv handle, so the event loop can run empty for a moment.
  - When it does, Node's main thread waits for all of V8's background tasks to finish (`NodePlatform::DrainTasks`).
  - One of those tasks, a Maglev compile, was waiting for a garbage collection that only the main thread can run. Neither side moves, and the process sits idle forever.
  - The native stacks (`sample`) were the same in all 5 stalls caught here (assessment 4, platform 1), and in 2 idle test processes from other worktrees. It matches Node issue 54918.
- **Fix.** `server/db/index.js` keeps a do-nothing interval running while PGlite starts and clears it once PGlite is ready. That keeps the loop from running empty during start-up. This helps the tests, the seed script and the e2e server; a running server always has its socket open, so it wasn't affected. There's no workaround in our code for Maglev itself: `--no-maglev` isn't allowed in `NODE_OPTIONS`.
- **Checked:**
  - Before the fix, three loops (assessment twice, platform once) ran next to back-to-back `vite build`s. 5 of about 24 runs stalled.
  - After the fix, the same three loops ran 30 times each with no stall: 90 of 90 passed, at a machine load average above 300.
  - The full `npm run test:server` finished twice in a row: 253 of 253 passed each time (163 s and 230 s).
  - The temporary tracing in `helpers.js` was removed.
- **Not done:** Node can still hit the same wait at process exit, after the last test. It wasn't seen in any run here. The full fix is a Node upgrade (the machine has 23.11, which is past end of life). That's your decision.

### v2 — Emoji and confirm() cleanup in parked modules (built in parallel, 12 Nov 2026)

Finishes B5 and the `confirmAction()` switch in the modules that are still switched off.

- **Emoji:** the last 36 in source are gone (35 in parked modules and one in a comment in `lib/communities.js`). The only emoji left in source is the `EMOJI_ICON` table in `icons.jsx`, which turns emoji stored in old data into icons.
  - New icon names in `icons.jsx`: camera, cameraoff, screen, screenoff, hangup, speaker, slides, music, laugh, thanks, reply, external and ticket. Old reaction emoji (laugh, thanks, eyes) now map to icons.
  - Live: the call buttons draw Lucide icons. Muted and speaking show as labelled icons.
  - Channels: reactions are stored by icon name and shown as icon buttons with names ("React: Laugh", "Like: 2"). Older emoji reactions show their mapped icon. Start call, Add reaction and Reply in thread are icon buttons.
  - Leaderboard: badges, praise badges and challenges are drawn with `<Icon>`. The top three ranks show a medal icon with the number. The "badge unlocked" notification no longer ends with the icon name.
  - Files: file icons are icon names drawn with `<Icon>`, in the list and the viewer.
  - Surveys: rating stars are icons with an accessible "3 stars" name.
  - Ideas, Web tabs and Forums: the comment count, "Open in new tab" and category icons are now icons.
- **Bugs fixed while doing this.** Several places printed an icon name as text, left over from workstream B's emoji-to-name change:
  - `ControlButton` showed "micoff" on the call bar.
  - The participant list showed "micoff".
  - Reaction chips showed "like".
  - Leaderboard badges showed "pen".
  - Files showed "drafts".
- **confirm():** all 22 browser `confirm()` calls in parked modules now use `await confirmAction(...)`, with the same wording. The channel "last member" question has no leading verb, so it names its button "Leave and delete" and is marked as dangerous.
- **New test:** `server/test/source-rules.test.js` reads the source. It fails if any emoji appears outside the `EMOJI_ICON` table (in `src`, the seed, the server scripts, lib and routes) or if `src` calls the browser's `confirm()`. Both checks failed on `main` and pass here.
- **Checked:**
  - Build passes.
  - The emoji scan shows emoji only in `src/components/icons.jsx`, and grep finds no browser `confirm(`.
- **Not done here:**
  - Not opened in the browser. The modules stay off, so the new icons, reaction buttons and dialogs are checked only by the build.
  - Edge-case rows UX-02 and UX-07 cover every screen, so they stay "Not run".
  - Characters outside the emoji range (arrows such as "←" and "↑", "✕", "■", "●", "☆", "＋") are still text in these modules.

### v2 — System health (server) (built in parallel, 12 Nov 2026)

Brief Part 11 "system health", `PROPOSAL_V2.md` §3.5. Server only; the Platform Admin screen comes with workstream G.

- **Job runs.**
  - `018_health.sql` adds `job_runs`: job, started and finished times, ok, error text, and the count the job returned.
  - `runJobs` in `lib/jobs.js` records every run. Error text is the message only, with email addresses masked, cut to 500 characters.
  - Runs older than 7 days are pruned on each pass.
  - Jobs stay independent, as before: one failing doesn't stop the next. `runJobs` never throws, even when the database can't be reached.
  - The job list is exported as `JOBS`. Tests pass their own list.
- **`GET /api/admin/health`** (`routes/health.js`). A new permission, `health.view`, is given to Platform Admin; Super Admin has everything. It's also in `/admin/me/permissions`.
  - Database: kind, whether it answers, ping time, `pg_database_size` (PGlite supports it), server version, and row counts of 19 main tables.
  - Jobs: for each job, the last run (with duration and count), last success, failures in the last 24 h, and the last error. Jobs that have never run are listed with `lastRun: null`.
  - Email outbox: queued, sent and failed in the last 24 h, failed emails still being retried, and the oldest queued.
  - File storage: bytes and count, with soft-deleted files shown separately (their bytes are still stored).
  - Active sessions, and deleted communities waiting for removal: how many, how many are overdue, and the next removal time.
  - Server: start time, uptime, Node version and `process.memoryUsage()`. App version comes from `version.json` if present, else `package.json`; only version, commit and build time are shown.
  - `attention` codes for the page to turn into sentences: `database_unreachable`, `jobs_not_running` (no run for 5 minutes), `job_failing`, `emails_failed`, `emails_stuck` (queued for over an hour), `removal_overdue`.
  - Each part is read on its own and is `null` if it can't be read, so one missing number never fails the page.
  - The output has only counts and times: no emails, names, tokens or settings values.
- **Checked:**
  - `server/test/health.test.js`: 8 pass. They cover:
    - Permissions: Platform Admin and Super Admin 200; member, Owner and Community Manager 403; signed out 401.
    - The shape of the report.
    - Recording on success and on an injected failure: the next job still runs, the error is masked and truncated.
    - `runJobs` with a broken database: it resolves.
    - Pruning at 7 days, and failures counted in the last 24 h.
    - Outbox, storage and removal counts.
    - No email addresses, names, password hashes or session ids in the output.
  - Every server test file run on its own: 261 pass (the 253 before plus these 8), including platform 24, admin 12, stage4 26 and auth 24.
  - `events.test.js` stalled once (the known idle-child stall, while other worktrees ran tests at the same time). It passed 21 of 21 on the rerun.
  - No client changes, so no build was needed. The emoji scan is unchanged from `main`.
- **Not done here:**
  - The Platform Admin screen (workstream G).
  - `version.json` isn't written by `scripts/appsail-bundle.sh` yet, so the version shown is `package.json`'s 0.1.0, with no commit.
  - Overlapping runs are not prevented: if a pass takes over a minute, the next interval starts another, as before.
  - No edge-case row in the register is specifically about system health, so none were marked. INT-01 (degraded providers) is only partly covered: email failures are now visible to staff.

### v2 — Community templates (server) (built in parallel, 12 Nov 2026)

Workstream F, server half (MASTER_BRIEF_V2 Part 4.1–4.4, PROPOSAL_V2 §3.3 and §5). Built on branch `v2-f-templates`.

- **Data** (`015_templates.sql`):
  - `community_templates` (key, category, name, description, status draft / published / inactive, `current_version`, `revision`) and `template_versions` (questionnaire, blueprint, `published_at`, `published_by`; one version per number). A version with no `published_at` is the draft; there's at most one.
  - Communities gain `template_id` and `template_version`. Both are null for a community made from scratch.
- **Categories** (`shared/categories.js`, `server/lib/categories.js`): exactly Alumni, Education, Professional Networking, Technology, Business, Hobbies and Interests, Organisation, General Community, Other.
  - Create and edit refuse anything else (`INVALID_CATEGORY`, any capitalisation accepted and stored as listed).
  - Omitting the category on create stores Other.
  - An edit that sends back a community's old category unchanged is accepted, so older rows (City, Batch…) keep working and aren't rewritten.
  - The current create and edit form lists the 9 categories, and still shows an older value until it's changed.
- **Templates** (`server/lib/templates.js`, library in `server/lib/template-library.js`):
  - 8 published version-1 templates, one per category except Other, each with its own questions. Question types: text, long text, single choice, multiple choice, list of short items, yes/no. Each question has a key, label, help and required flag. A question can depend on an earlier answer (`showIf`), so only the relevant ones count.
  - A blueprint holds the name and description patterns, sections, Learning on or off, discussion topics, membership (visibility, post approval, who can post, who can create events, members add resources), resource categories, event defaults, guidelines and roles in use, plus rules ("when this answer, set or add that").
  - The library is seeded once at start-up by key. A template a Platform Admin has since changed is left alone.
- **Routes:**
  - `GET /api/templates` and `GET /api/templates/:key`: published templates, only for people allowed to create communities (`CREATE_RESTRICTED` otherwise).
  - `POST /api/templates/:key/suggest {answers, version?}` → `{config}`. It checks the answers (all missing required ones named in `fields`, `UNKNOWN_ANSWER`, `INVALID_ANSWER`) and writes nothing. `config` has exactly the shape of the `POST /communities` body: `name, description, category, visibility, settings {apps, guidelines, requireApproval, whoCanPost, whoCanCreateEvents, membersAddResources, resourceCategories, eventDefaults, roles}, topics, template {key, version}`.
  - `POST /api/communities` now also takes `topics` (up to 12, created in the same transaction) and `template {key, version}`. Both paths go through the same checks: name, settings allow-list and values, category, topics. The template only adds its own checks: unknown is `TEMPLATE_NOT_FOUND`; draft or inactive is `TEMPLATE_INACTIVE`; an older version is `TEMPLATE_VERSION_CHANGED` with `currentVersion`. The configuration is copied into the community, and the template is never read for it again.
  - New settings keys: `resourceCategories`, `eventDefaults`, `roles`. `settings.apps` must now name known sections: the new ones (discussions, events, resources, members, learning) or the older app names the current screens still send.
  - Changes in `routes/communities.js` are kept small: imports, two schema properties, and calls into `lib/templates.js`.
- **Administration** (`/api/admin/templates`, permission `templates.manage`, Platform Admin; Super Admin has everything):
  - List with usage counts per version, and detail with the current version and the draft. `versions/:n` shows an older version.
  - Create (a draft, idempotent).
  - Edit: questions and blueprint go to the draft. Editing a published template starts the next version's draft from the current one. Name, description and category aren't versioned. A stale `revision` is refused.
  - Publish: checks the draft, including a trial suggestion from sample answers that has to pass the community checks. It then becomes the current version. Communities made from earlier versions keep their configuration and their recorded version.
  - Deactivate and reactivate.
  - All of these are audited (`template.*`). Community creation's audit entry names the template and version.
- **Checked:**
  - `server/test/templates.test.js`: 17 pass. They cover: two communities from one template are independent; an inactive template is refused while communities already made from it keep working; publishing v2 leaves v1 communities unchanged and recorded as v1; a stale version is refused with the current one; an invalid configuration gets the same refusal with or without a template and writes nothing; a duplicate submit creates one community; suggestions name missing answers and fill placeholders; only Platform and Super Admins manage templates; scratch creation records no template; categories are enforced; creation turned off mid-wizard.
  - Other server tests, one file at a time: communities 37, core 19, platform 24, admin 12, stage4 26, public 6 and moderation 20, all passing.
  - The known intermittent stall happened four times: `platform.test.js` twice, and `templates.test.js` twice after the final edits. Each time the child sat idle at 0% CPU, with the machine's load average between 100 and 430 from parallel work. Each file passed when run again.
  - A probe of `setup()` alone (migrate, build the app, seed the templates) finished normally, so the stall isn't in the new start-up seeding. Its cause is still unknown.
  - `npx vite build` passes.
- **Not done here:**
  - The creation wizard and the template administration screens (client).
  - Turning `settings.apps`, `resourceCategories`, `eventDefaults` and `roles` into behaviour. They're stored and validated; the client and the event and resource forms don't read them yet.
  - Discarding a draft, and deleting a template.
  - The seed's demo Alumni community made through a template.
  - Category isn't required at the API (an omitted one becomes Other); the wizard should always send one.

### v2 — Closed-community invitations (server) (built in parallel, 12 Nov 2026)

Built from MASTER_BRIEF_V2 Part 5 ("Closed: invitation required") and PROPOSAL_V2 workstream F. Server only; the screens come later.

- **Table** (`016_invitations.sql`): `community_invitations`, one row per invitation, by account or by email (normalised), never both.
  - Only the SHA-256 of the token is stored, like sessions.
  - Expires after 14 days. Roles: Member, or Moderator/Admin when the inviter outranks it.
  - Unique indexes allow one open invitation per community and account, and per community and address. An expired one is set aside (`superseded_at`) when a new one is sent, so the history stays.
  - `sent_at` is when the current link went out (a resend moves it). A removal after it voids the invitation.
- **Routes** (`server/routes/invitations.js`):
  - `POST /communities/:id/invitations`: Owners and Admins only. Up to 50 people per call, at most 200 emails a day per community (new invitations and resends together, counted from the audit log), 10 calls a minute per person, idempotent.
    - Each person gets a result: `invited`, `open` (the open invitation is returned, MEM-12) or `skipped` with a code.
    - By account, the codes are `ALREADY_MEMBER`, `BLOCKED`, `SELF_INVITE`, `ACCOUNT_UNAVAILABLE`, `NOT_FOUND` or `CANNOT_INVITE` (a user-level block).
    - By email, the only code is `SELF_INVITE`. The answer, the list row and the audit entry don't depend on which account (if any) holds the address, so invitations can't be used to look accounts up by email. The holder decides only whether anything is sent: a member, a person blocked from the community or blocking the inviter, and a suspended or deactivated account get no email.
    - Someone invited both by account and by address holds two invitations (linking them would tell the Admin whose address it is). They see one in their list, and accepting either uses up both.
    - Removed people can be invited back; an invitation they were removed since is set aside and a new one made. Administrative Mode can't invite, because it never changes membership.
  - `GET /communities/:id/invitations`: every invitation, with `?status=open|accepted|expired|revoked`. An email invitation shows only the address typed, never which account it belongs to.
  - `DELETE /invitations/:id`: revoke. Safe to repeat. An accepted invitation can't be revoked.
  - `POST /invitations/:id/resend` (added): a new link and 14 more days. The old link stops working, and an expired invitation (or one voided by a removal) can be renewed this way. At most once an hour per invitation, and within the daily limit. The same per-person rules as a new invitation apply to whoever resends: an account invitation is refused with the code, an email one just isn't sent.
  - `GET /invitations/:token`: a preview that works signed out. It shows the community's name and visibility and the inviter, and only while the invitation can be used. The inviter's note appears only for the account invited. Otherwise it answers `INVITE_INVALID`, `INVITE_EXPIRED`, `INVITE_REVOKED`, `INVITE_USED`, `INVITER_NOT_ALLOWED`, `COMMUNITY_UNAVAILABLE` or `COMMUNITY_REMOVED`, each telling the person to ask for a new one.
  - `POST /invitations/:token/accept`: must be signed in.
    - An account invitation is for that account. An email invitation is for the account whose *verified* email it is; anyone else gets `WRONG_ACCOUNT`, without the address (VIS-09).
    - Everything is checked again: the community's status, and whether the inviter is still an active Owner or Admin who outranks the role (MEM-11). It also refuses people blocked from the community, and people removed since the invitation was sent (`REMOVED_AFTER_INVITE`).
    - A Private community's approval step is skipped. A pending request becomes the membership, in one row (MEM-13). A second click gets the same answer.
  - `GET /me/invitations` and `POST /me/invitations/:id/accept` (added): the invitee's own list. The in-app notification never carries the token, so it points here.
- **Email and notification:**
  - The mailer template `community_invite` names the community and the inviter only, never the note. The link is `${origin}/#/invite/c/<token>`.
  - People already on CommunityOne also get an in-app `community_invite` notification (category Join requests, in-app only). It links to `/invitations` while open and to the community once accepted. Once expired or revoked it says "This invitation has expired or was withdrawn", without a link or the community's name (NTF-05).
- **Token kept out of records:** it's not in the audit context, notifications or email subjects. The two routes that take it in their path log at warn level, so the request log never has the URL (checked by a test).
- **Audit:** `community.invite`, `community.invite_resend`, `community.invite_revoke`, `community.invite_accept`.
- **Checked:** `server/test/invitations.test.js`, 28 tests, all pass. They cover:
  - accept, expire, revoke, wrong account, unverified email
  - blocked, removed (and removed since), already member, self, suspended
  - resend by a blocked Admin, resend to a community-blocked person, resend to an address whose holder is blocked
  - inviting by account and by address doesn't reveal the link either way; an address invited before its account verified it
  - removed while an invitation was open: a new invite or a resend works again
  - duplicate invite returns the open one, resend (and its hourly limit), simultaneous invites, Idempotency-Key
  - Private skips approval, Closed only by invitation, Private made Closed, suspended and deleted communities
  - inviter demoted (MEM-11), role limits, Administrative Mode
  - 50 per call, 200 a day with resends counted, 10 a minute
  - token never in clear in the database, audit, notifications or request log
- Also run, one file at a time: `communities.test.js` 37/37, `platform.test.js` 24/24, `stage4.test.js` 26/26 (notifications) and `mailer.test.js` 5/5. The known idle stall hit once in `platform.test.js` and once in `invitations.test.js`, both at under 1 s of CPU with other agents' test runs going at the same time. Each was stopped and passed on the rerun. Register rows marked Pass: VIS-06, VIS-09, VIS-10, MEM-11 to MEM-13, plus extra evidence for MEM-05. MEM-14 is Partial (no capacity yet) and NTF-05 is Partial (server only until the `/invitations` screen exists).
- After review (same day): resend now applies the per-person checks; email entries no longer reveal which account holds an address; `sent_at` lets a resend or a new invite revive an invitation voided by a removal; addresses of suspended accounts are sent nothing; resends count toward the daily limit and wait an hour; the expired notification says so. Rerun one file at a time: `invitations.test.js` 28/28, `stage4.test.js` 26/26, `communities.test.js` 37/37, `mailer.test.js` 5/5, `platform.test.js` 24/24.
- **Not done here:**
  - **The screens.** The client needs:
    - the `/invite/c/:token` page (the old `/invite/:code` route is a different, older page)
    - a `/invitations` list
    - an Invitations section in Manage
  - **Declining.** An invitee can't decline yet; it just expires.
  - **Signing up from an invitation.** It works only while registration is open. Invitation-only sign-up when it's closed isn't built.
  - **Community capacity.** Communities have no capacity setting, so MEM-14's "full" case doesn't arise yet.
  - **Email bodies.** The development mail transport prints them to the console (as it does for confirmation links), and `email_outbox` keeps the body with the link, as it does for other links.
  - **Deleted accounts.** Deleting an account leaves the address on its email-bound invitations.
  - **The daily limit is checked once per batch,** not atomically, so two batches at the same moment can go over it by one batch (at most 50).
  - **`CANNOT_INVITE` by account** still tells an Admin that the person has blocked them (or they the person); kept as before, for a product decision.

### v2 — Community branding and enabled sections (server) (built in parallel, 12 Nov 2026)

Server only, on branch `v2-e-branding` (PROPOSAL_V2 §3.2 and §9; MASTER_BRIEF_V2 Part 2.2 and 10).

- **Logo and cover.**
  - `017_branding.sql` adds `logo_file_id` and `cover_file_id` to communities. Both reference `files` and are set to null if the file row is removed.
  - Owners and Admins upload with the existing store (`POST /communities/:id/files`), then choose the picture with `PATCH /communities/:id/branding` `{ logoFileId, coverFileId, accent }` (`server/routes/branding.js`). Only images the caller uploaded to that community's own store are accepted, and not a file already used by a resource, a post, a lesson or a submission, so no member's file is shown to visitors without them choosing it. The guard runs both ways: resources (add and replace) and post attachments refuse a file that is a logo or cover, so deleting those can't take the logo with it. `null` clears a picture. Only the fields sent are written, so two admins saving different fields at once keep both (SET-03). A save that changes something is audited (`community.branding`, with from/to) and bumps the community's `version`; a save that changes nothing does neither. A suspended or archived community refuses changes with `409 SUSPENDED` or `409 ARCHIVED`.
  - `GET /communities/:id/logo` and `/cover` serve the picture with the visibility of the community's card. Signed-out visitors get them for active Public and Private communities. Signed-in people go through `access()`: Closed ones only for members, suspended ones only for their own staff, deleted ones for nobody. Platform staff who manage communities or read platform analytics get any community's pictures except deleted ones without admin mode, because an `<img>` can't send `x-admin-mode` and the picture is card metadata, not content. Headers: `private, max-age=60`, `nosniff`, a sandbox CSP.
  - `logoUrl` / `coverUrl` (`brandingUrls()` in `lib/community.js`) are in `publicCommunity()` and in: `/communities`, `/public/communities`, search, Home (`/dashboard` communities and suggestions), post cards (`community` on feed and post responses), My Learning and lesson pages, moderation cases, notification and saved-item community references, and Platform Admin (overview, user detail, communities list, the community panel, the analytics per-community list). They are null for a deleted community, since nobody can fetch those. The file id is in the address, so a new picture never shows a cached old one.
- **Accent.** Owners and Admins choose one of the six community accents (`ACCENTS`). Anything else is `400 INVALID_ACCENT`.
- **Enabled sections.** Enforced on the server (`sectionOn`, `sectionsOf`, `requireSection` in `lib/community.js`).
  - The sections are Discussions, Events, Resources and Learning. Overview, Members and About always show.
  - The new switches store the sections that are on as `settings.sections` (a list of `discussions`, `events`, `resources`, `learning`; added to the allowed setting keys, anything else is `400`). When it is present it decides, whatever `settings.apps` says.
  - A community with neither list has every section on, which is how AlumniZone and every seeded community behave (none of them stores a list).
  - Lists saved by the older settings screens (`settings.apps`) use the prototype's names: `feed`/`forums` mean Discussions, `files`/`manuals` mean Resources. Those screens never offered Learning, so Learning stays on only for a list that has an older-only name (`feed`, `forums`, `files`, `manuals`, `dashboard`, `tasks`, `ideas`, `townhalls`, `webtabs`) and none of the newer ones. An empty list, or one with only Events (and Members), switches Learning off too.
  - When a section is off, members get `404 SECTION_OFF` from its list and its items. People who can't view the community at all get the ordinary not-found, checked first, so outsiders can't learn the switches (courses included). Moderators, Admins and Owners (and admin mode) can still read them.
  - One rule for writes while it's off: nothing is added, published or changed (`409 SECTION_OFF` for staff), and that includes approving and pinning posts. Removals go through: moderators remove posts, admins delete resources, courses, modules and lessons, and authors delete their own posts, comments, event comments, events they host and resources they added. Withdrawing an RSVP, reacting and voting count as changes and wait. Nothing is deleted by the switch itself.
  - Notifications and saved items whose post, event, resource or lesson sits in a switched-off section show as unavailable to members (no excerpt, title or link); staff still see them.
  - Enforced on: posts (create, the community's discussion list, open, reply, react, vote, acknowledge, edit), events (list, open, create, edit, cancel, RSVP, comment), resources (list, add, edit), and learning (catalogue, courses, lessons, enrolment, progress, quizzes and assignments, all through `loadCourse`).
  - Home's feed, Home's post cards, the calendar and Home's events, search's posts, and the public cards' upcoming events leave out a community whose section is off.
  - `GET /communities/:id` now returns `sections: { discussions, events, resources, learning }` for the client. Staff still get `settings` (and the stored list) for Manage.
- **Checked:**
  - New `server/test/branding.test.js`: 26 tests pass (17 at first, 9 added after an independent review). They cover: upload and set the logo and cover; clear; a refused upload or a non-image keeps the previous logo (COM-04); another community's file refused; a resource's file refused; members and moderators can't change branding; a Closed logo hidden from signed-in outsiders and visitors (VIS-04); signed-out visitors see a Public logo from public discovery; suspended and deleted communities; a removed file clears the logo; accent validation and audit; the version bump; each section off (Events, Discussions, Resources, Learning) refusing writes and lists for members while staff still read; no stored list means everything is on; the older names; switching through `PATCH /communities/:id`. Added after review: the logo and cover refused as a resource, a replacement file and an attachment, and still served; a member's image refused as the logo (VIS-04); two admins saving different fields keep both, and a no-op save bumps nothing (SET-03); platform staff fetching suspended and Closed logos, deleted ones listing none, and the analytics list and community panel carrying them; an empty list and an Events-only list switching Learning off; `settings.sections` deciding over an older list; outsiders getting the same not-found for a Private course whether Learning is on or off (VIS-02); approving and pinning refused while Discussions is off, while authors still delete their own posts and comments and admins delete a course; notifications for a switched-off section unavailable to members.
  - Also run, one file at a time, all passing: communities 37, stage4 26, events 21, learning 13, core 19, public 6, assessment 20, moderation 20, platform 24, admin 12. With branding that's 224 tests.
  - `public.test.js` VIS-01/11 checks exactly which keys a public card has, so `logoUrl` and `coverUrl` were added to its list on purpose. It failed until then.
  - `assessment.test.js` stalled once (the known idle-child stall; killed after 400 s) and passed 20/20 when run again.
  - Emoji scan: no new emoji. Everything it lists was already in parked modules and `icons.jsx`.
- **Not done here:**
  - The client: the upload and crop screen, the header with cover and logo, the accent picker, and section switches in Manage (they should write `settings.sections`). Manage → Settings still uses the old app list (`components/groups/helpers.js` `APPS`), which the server maps as described above. The community page doesn't yet hide tabs for sections that are off.
  - Replacing or clearing a logo leaves the old file in the store (it isn't deleted), so it can be chosen again.
  - Background jobs still run for a switched-off section: event reminders and scheduled posts.
  - Topics (`GET/POST /communities/:id/topics`) and moderation reports are not gated by the Discussions switch yet. `topics.js` is being changed by the templates workstream; gate it with `requireSection(a, 'discussions')` once that lands.
  - Members is not a switchable section on the server. The older form always keeps it on.
  - **Your decision:** with Discussions off, admins can't post announcements either (announcements are posts). Should announcements stay available when Discussions is off?

### v2 — Parallel round merged into main (12 Nov 2026)

- **Merged, in this order:** `v2-test-stall`, `v2-b-parked`, `v2-g-health`, `v2-f-templates`, `v2-f-invites` and `v2-e-branding`.
- **Conflicts:**
  - In the docs, both sides were added.
  - `app.js` and `permissions.js` now have all the routes, and both `health.view` and `templates.manage`.
  - `cleanSettings` in `communities.js` runs the templates checks and also checks `sections`.
- **Joined up after the merge:**
  - Template suggestions now write `settings.sections`, the list that `sectionOn` enforces, instead of the older `apps`. Members always shows.
  - The topic routes follow the Discussions switch: members get `404 SECTION_OFF` and writes get `409`. The branding agent left topics for after the templates work.
  - Two new tests cover this: one in `templates.test.js` (COM-12), and "topics follow the Discussions switch" in `branding.test.js`.
- **Checked on main:**
  - The full `npm run test:server` passed 335 of 335 in one run (156 s), with no stall, while a `vite build` and the Playwright run ran at the same time.
  - `npx vite build` passes.
  - `npm run test:e2e`: 7 passed, 1 skipped (the delete-and-restore journey runs on desktop only, as before).
  - No browser `confirm()` is left in `src`.
- **Not done:** the screens for templates, invitations, branding and health. They wait for the C–G boards to be approved.

### v2 — Workstream C: public website and sign-in (12 Nov 2026)

The boards were approved as drawn (C1–C14; the user said "start" on the unchanged boards).

- **Public chrome** (`components/public/PublicChrome.jsx`):
  - Nav: About, Explore Communities, Features, Learning, Sign In, Get Started. Signed-in visitors see Open CommunityOne.
  - Features and Learning scroll to landing sections, and focus them (C1).
  - On phones: a Menu button that closes with Escape.
  - The theme choice is in the footer.
  - The text-page frame is on the `--az-*` tokens.
- **Landing** (`pages/Landing.jsx`):
  - The brief's order: hero, live discovery, features, how it works, discussions, events and resources, learning, benefits, final call to action.
  - Each product picture is a static drawing marked Example, which reads as one image for screen readers (C2).
  - Discovery shows `GET /public/communities` in the server's order. Its chips come from the unfiltered response and filter the cards in place. It has loading, error and empty states (C3).
  - No totals, testimonials or logos (C5).
- **About** (`pages/About.jsx`): rewritten from the board, covering visibility, roles and starting a community (C13).
- **Sign-in screens** (`components/auth/AuthParts.jsx`):
  - One centred card with footer links (C6).
  - One password field with Show (C12).
  - Notices and `SendLinkForm`.
- **Sign in** (`pages/Login.jsx`): one notice per account state, each with its own way forward. The demo-accounts line appears only when the server reports a development mailbox (C11).
- **Create account** (`pages/Signup.jsx`):
  - Errors appear next to their own field, and focus moves to the first one.
  - "Email already used" links to Sign in and to reset.
  - The agreement links to the Terms and Privacy pages, and the inline guidelines text is gone (C14).
  - "You were looking at X" uses router state from the card's Join link.
  - Paused sign-ups and domain limits are shown in the platform's wording.
  - "Check your email" has Send it again, Start again, and the outbox link in development only.
- **Forgot password** (`pages/Forgot.jsx`, `/forgot`): a page instead of a dialog. The email already typed comes over in router state, never in the address (C7).
- **Email links** (`components/auth/TokenPages.jsx`): an expired or used confirmation or reset link offers Send a new link on the same screen (C8). Each token is now confirmed once per token rather than once per page: a second link opened in the same tab used to be ignored, and the C8 journey caught it.
- **Welcome steps** (`pages/Welcome.jsx`):
  - They list only Public and Private communities, with search, category chips and Show more. Nothing is pre-selected.
  - When the person signed up from a community's Join, that community shows first under "You were looking at", not joined (C9).
  - A live Joined and Requested count.
  - Start a community appears only when `GET /templates` doesn't answer `CREATE_RESTRICTED`.
- **Server, wording only (C10):**
  - Sign-ups closed: "CommunityOne isn’t accepting new accounts right now."
  - Approval after confirming: "Email confirmed. A CommunityOne administrator will review your account."
  - Approval at sign-in: "Your account is waiting for approval from a CommunityOne administrator."
  - `auth.test.js` checks all three.
- **Shared styles:** the `--az-link` token, plus `.link`, `.panel`, `.filter-chip`, `.notice-*` and `.field-error`. In light mode, community tiles use their accent tint. `VisibilityBadge` is now built on `Badge`.
- **Checked:**
  - `e2e/public.spec.js`, at 1280 and 375 px: the landing sections, filtering in place and no side scroll. Join from a card, through sign-up and confirmation, to the welcome steps with that community shown and not joined; finishing leaves no memberships. A spent link, then Send a new link, then the new link works.
  - Full `npm run test:e2e`: 13 passed, 1 skipped (desktop-only, as before).
  - `auth.test.js` 24 and `source-rules.test.js` 2 pass; `vite build` passes.
  - Browser: the landing page at desktop and phone width, Sign in with wrong details, Forgot with the email carried over, Create account errors, and welcome step 2.
- **Not done here:**
  - No browser journey covers the reset-link journey. Only the confirmation link is covered.
  - The Terms of Service text and a contact address are still waiting on the user.
  - Explore and Home's empty state belong to D. Invitation pages belong to F.
  - Help, Privacy, Terms and Contact have the new frame, but their inner text still uses older classes, which `light-invert.css` covers.

### v2 — Workstream D: shell, Home, Explore, My Communities, Profile, search (12 Nov 2026)

The boards were approved as drawn (D1–D12: the user said "Start D" on the unchanged boards). Built in parallel: I did the shell, Home and routes, and four agents took the rest, each owning its own files.

- **Shell** (`components/Layout.jsx`, `lib/shell.js`, `components/shell/CommunityPicker.jsx`):
  - **Sidebar (D1):** the eight destinations, then your communities (the ones you manage first, then A to Z, the first 8), Create Community only while creating is allowed (`GET /templates`), and Administration for staff.
  - **Top bar:** the search box (D9), a Create menu that offers Post, Event and Community only where you may, using `canPostIn` and `canCreateEventsIn` from `/dashboard`, and asks which community when there's more than one.
  - **Account menu (D12):** Profile, Notification settings (`/notifications?settings=1`), Theme as `menuitemradio`, and Sign out. Reset demo data shows in development builds only.
  - **Phones (D2):** the five-tab bottom bar and the Menu sheet, which keeps focus inside, closes with Escape and has Theme and Sign out. "/" focuses search on desktop and opens Search on a phone.
- **Addresses (D11):** `/home`, `/explore` (inside the app when signed in, the public page otherwise), `/communities` and `/profile`. Redirects: `/dashboard`, `/feed`, `/feed/bookmarks`, `/groups`, `/groups?tab=discover` and `/groups?new=1`.
- **Home** (`pages/Dashboard.jsx`, D3 and D4):
  - The welcome line with quick actions.
  - Then, in a fixed order: Needs you (replies, Mandatory Reads soonest due first, invitations with Accept, connection requests), Coming up (14 days, unanswered first), Continue learning, New in your communities (announcements marked) and Recommended.
  - Empty groups are left out.
  - The first-run Home has the categories with real counts, up to 6 Public communities with Join, Create Community when allowed, and Complete your profile.
- **Server, agent A** (`routes/communities.js`, `routes/dashboard.js`):
  - `GET /communities?scope=discover`: category, sort, hideMine, q, pages of 24, total and categoryCounts. Closed communities never appear (VIS-04).
  - The membership object gains `rejoinAfter` (MEM-07). `REJOIN_COOLDOWN` now drives the join route too.
  - `/dashboard` adds comingUp, pendingRequests, invitations, canPostIn, canCreateEventsIn, and up to 6 suggestions when you're in none.
  - Tests: `server/test/discovery.test.js` (15).
- **Explore and My Communities, agent A** (`pages/ExploreCommunities.jsx`, `pages/MyCommunities.jsx`, `components/groups/MembershipAction.jsx`):
  - One action per membership state (D7).
  - My Communities groups rows into Needs you, Managing and Member (D8). An Owner's Leave is disabled, with the reason.
  - `?new=1` opens today's create form.
- **Search and Profile, agent B** (`routes/search.js`, `routes/profiles.js`, `pages/Search.jsx`, `pages/People.jsx`, `components/search/SearchBox.jsx`, `components/profile/`):
  - Search gains resources and courses, and `mode=suggest` (3 per kind).
  - New routes `GET /profiles/:id/communities` and `/profiles/:id/posts`.
  - Preview as a member or a connection (`as=`), allowed only for your own id (`PREVIEW_OWN_ONLY`).
  - Follow is gone from profiles.
  - Tests: `search-v2.test.js` (9) and `profiles-v2.test.js` (15). New register row VIS-16 (P0).
- **Category review, agent C (D6)** (`lib/data-migrations.js`, `routes/platform.js`, `components/platform/CategoryReview.jsx`, the Administration tab):
  - A dry run, then staff confirm the whole list.
  - It's applied once as the data migration `d6-categories`: logged, audited, and undone with `node server/scripts/undo-data-migration.mjs d6-categories`.
  - Tests: `category-review.test.js` (5). **Not applied yet**: until staff confirm it, older categories (City, Interest and so on) show as Other.
- **Restyle, agent D:** Notifications (with the `?settings=1` scroll), Saved, Events and My Learning are on the tokens, with no new behaviour.
- **Checked:**
  - Full `npm run test:server`: 379 of 379 in one run.
  - `vite build` passes, and `source-rules.test.js` passes.
  - `npm run test:e2e`: `e2e/shell.spec.js` (first-run Home, joining from Explore then the sidebar and My Communities, the five bottom-bar tabs, redirects, "/") 6 of 6. The full e2e run before the last test fix was 17 passed, 2 failed (that test's locator) and 1 skipped; after the fix, the shell journeys pass at both widths.
  - Browser, as Sara (Platform Admin): Home, the phone Menu sheet, the account menu, Explore, My Communities, Profile, and search suggestions.
- **Not done:**
  - Declining an invitation: the server has no route for the invited person, so it shows Accept only.
  - Some dates the boards show (Restricted until, You left on, You asked on) aren't sent by the server.
  - "Shared with connections only" on other people's profiles: the server doesn't send the setting, so it says "Not shared with you".
  - Custom profile fields aren't shown.
  - Show more under New in your communities: the server returns 5.
  - Per-community unread counts.
  - Shared event components (`EventCard`, `RsvpButtons`, `EventForm`, …) still use the older palette.

### v2 — Workstream E: community pages and branding (12 Nov 2026)

The boards were approved as drawn (E1–E13: the user said "start" on the unchanged boards). I built the page frame, Overview, the header actions and the phone top bar. Four agents took the rest, each owning its own files.

- **Page frame** (`pages/Community.jsx`):
  - **Header:** the uploaded cover (or a flat accent band) and logo (or the lettered tile), name, facts, your role badge, and one primary action, for non-members only (E12).
  - **Actions menu:** Copy link; for admins, Add members, Community settings, Branding and Archive; then Leave. An Owner is told to transfer ownership first.
  - **Delete community** (staff only) opens the Stage 7 review at `/admin/communities?open=<id>`. The `prompt()` in `useCommunity.js` is gone, and the old Edit community dialog is retired.
  - **Tabs** follow the switched-on sections (E1), and a switched-off section's address goes to Overview. Visitors to a Private or Closed community see no tabs (VIS-01).
  - **Phones:** the community has its own top bar (Back, name, Search, Actions), and the app's bar is hidden inside a community.
- **Overview (E7):**
  - The next event is the featured item, with RSVP.
  - Then Announcements (an unacknowledged Mandatory Read first; the acknowledged count only when the server sends it), Featured discussions (pinned, up to 3), Recent activity (the newest 8 from posts, events, resources and courses, merged by time), Learning, People and About.
  - Empty sections are left out. Each section loads on its own, and one failing shows Try again without blanking the page.
  - RolePanel is restyled, and the Owner checklist gains "Add a logo and cover".
  - Event and course responses now carry `createdAt` and `publishedAt` for Recent activity.
- **E3 (tiles):** in light mode every community tile is the accent's deep shade with white initials. This replaces D's pale tiles, as E3 said.
- **Server rules, Branding and Sections (agent 1):**
  - `e2-sections` turns stored app lists into `settings.sections`, once, logged and undoable. It runs on every server start (`server/index.js`) as well as from the seed.
  - E4 image rules come from the bytes (`server/lib/images.js`: PNG, JPEG and WebP headers). A logo must be square, at least 256 px and up to 2 MB; a cover 4:1 (±2%), at least 1600×400 and up to 5 MB. Replacing an image soft-deletes the old one. Error codes: IMAGE_TYPE, IMAGE_TOO_LARGE, IMAGE_TOO_SMALL and IMAGE_SHAPE.
  - E8 limits pins to 3 (409 PIN_LIMIT), on create as well.
  - A Manage → Branding section with a live preview, and section switches in Manage → Settings.
  - Tests: `server/test/e-sections.test.js` (14) and `branding.test.js` (27).
- **Discussions (agent 2):** filters, search, sort, topics as chips on phones, reactions drawn as icons (E9), a remove dialog with a required reason (E10, `feed/RemoveDialog.jsx`), a Moderation heading in the post menu, and Follow removed. The composer is open on desktop and folds into "Write a post" on phones.
- **Events and Resources (agent 3):** a List and Month switch on the Events tab (E13). Event cards, RSVP, the calendar grid and the event form use the tokens. Resources has search, sort, categories, one Add menu on phones, and edit and delete only where the API allows (`canEdit`, `canAdd`).
- **Members and Learning (agent 4):**
  - Members is a directory (E11): search, role chips, Owners and staff first, join requests for Admins, then Manage or Report. Role changes stay in Manage.
  - The Learning catalogue and course page are restyled.
- **Fixed along the way:** the shared Modal now opens through a portal, because it was drawn under the sidebar. "Map link" is used for link locations everywhere. The Feed "Following" view no longer points to a Follow menu item that's gone.
- **Checked:**
  - Full `npm run test:server`: 393 of 393 in one run.
  - `npm run test:e2e`: 19 passed, 1 skipped. The composer journey now opens "Write a post" on phones.
  - `vite build` passes.
  - Browser, as Sara: Overview and header (desktop), the Private-visitor view and the community top bar (375 px), Discussions, Branding, and the Settings section switches.
- **Not done:**
  - Pressing the browser's Back button with unsaved branding changes isn't caught (HashRouter can't block it).
  - No upload progress, and JPEG EXIF rotation is ignored when reading sizes.
  - A file that was uploaded and then refused stays in the store.
  - A removed post vanishes from a moderator's list until reload.
  - The Manage link next to a member doesn't jump to that person.
  - Older classes remain in Report.jsx, the general Feed page, Settings outside the Sections panel, and the parked Town Hall and Live parts.

### v2 — Workstream F: creation, templates and invitations (12 Nov 2026)

The boards were approved as drawn (F1–F14: the user said "start" on the unchanged boards). Where the server built in the parallel round differed from the board, the board won: F12's five question types, and TPL-02 accepting an older published version.

- **Server (agent 1):**
  - Five question types: text, list, choice (with `multiple`), years and institution. `f12-question-types` converts the stored questionnaires (logged, undoable, runs at start).
  - Slots are written `{key}`. A sentence whose slot is empty is left out whole.
  - Any published version can be suggested from and published with. A draft or unknown version answers TEMPLATE_VERSION_UNKNOWN.
  - `POST /communities/validate` runs every create check and writes nothing.
  - Invitations can be declined (by token, signed out too, and from `/me`).
  - `POST /communities/:id/members` now sends invitations (F10).
  - Migration 019: an event category, `settings.eventCategories`, and resource categories from the community's list. It also adds the decline columns and `memberships.join_answer`.
  - `settings.audience` and `settings.joinQuestion`; the join route takes an `answer`.
  - Members filters: `?gradYear=&department=`, returning `filters`.
- **Creation wizard (agent 2):** `/communities/new` with Choose, Questions, Configure, Preview and Publish. The draft lives in localStorage under its own id. Validate runs before the single, repeat-safe publish, and logo and cover upload after it.
- **Invitations and categories (agent 3):**
  - Manage → Members → Invitations.
  - "Invite people" replaces Add members.
  - The invitation page `/invite/c/:token`.
  - Decline in My Communities.
  - Event and resource category editors, and category pickers.
  - Alumni filters in Members.
- **Template administration (agent 4):** Platform Admin → Templates, with the list, a questions editor, a blueprint editor, save (revision-checked), publish with the server's problems shown by field, deactivate and activate, version history, and the phone list only (F14).
- **Mine:**
  - The routes, and every Create Community link pointing at `/communities/new`.
  - Join text switched on in the wizard.
  - Community Managers hold `templates.manage` (F11, test updated).
  - The join question is asked with a Private request (`JoinButton`), answers show on join requests, and "Who this is for" shows in About.
  - Event categories reach the server (`toServer`).
  - The `e2e/create.spec.js` journeys.
  - `RATE_LIMITS=off` for the e2e server only (production ignores it), because the suite signs in more than the login limit allows.
- **Checked:**
  - Full `npm run test:server`: 413 of 413.
  - `npm run test:e2e`: 23 passed, 1 skipped, including both creation journeys at both widths.
  - `vite build` passes.
  - Each agent checked its screens against a real server. My own browser check was cut short: the shared browser pane was in use.
- **Not done:**
  - Discarding a template draft and deleting a template (no route).
  - The list of communities made from each version (only counts are shown).
  - A typed-in institution that isn't on the list isn't sent.
  - Explore's Request to join doesn't ask the join question; it's asked from the community page and the welcome steps.
  - Community Managers can't open Administration in the web app yet (`me.admin` only covers Platform and Super Admins; workstream G).
  - The seed doesn't record template ids on demo communities.
  - `mergeCommunity` still adds members directly. It's only used by the seed's All Hands merge.

### v2 — Workstream G: management and administration (12 Nov 2026)

The boards were approved as drawn (G1–G12: the user said "start" on the unchanged boards). Five agents built it in parallel, each owning its own files, and two more did the colour pass. I wired the routes and filled the gaps between them.

- **Server (agent 1):**
  - `g2-retire-membership-rules` removes stored automatic rules. It's logged, undoable, and runs at start; nobody is removed. `POST /communities/:id/invite-matching` replaces the rules; `source: 'rule'` and new `dynamicRule` values are refused.
  - `GET /communities/:id/visibility-impact?to=` gives the real counts for the G4 confirm, and visibility changes are audited before and after.
  - `settings.notifyDefaults` (G5): a member's own choice wins. Moderation and account notices are always sent.
  - `DELETE /communities/:id` answers 410 DELETE_RETIRED (G6).
  - Migration 020 adds course Teaching Assistants. `GET /courses/:id/learners` and `GET /communities/:id/teaching` serve G7.
  - Job runs are kept 14 days. System health lists failed emails with masked addresses, offers `POST /admin/health/emails/:id/retry`, reports `database.storage`, and warns `data_not_persistent` for PGlite in the app folder in production (G11).
- **Community settings (agent 2):**
  - Eleven sections at `/c/:slug/manage/settings/:section`, each with its own Save and Discard. Only that section's fields are sent, a 409 lets you reload the section, and leaving asks first.
  - The visibility confirm shows real counts, there's a roles matrix with the four switches, notification defaults, and the Danger Zone (no instant delete).
  - On phones, Manage is a list.
  - Overview and Queue are restyled. `groups/Settings.jsx` is now a thin wrapper.
- **Queue and Teaching (agent 3):**
  - One queue for reports, held posts, join requests, appeals and decided items (`queue/Queue.jsx`): a split view, and on phones a list, then the item with Apply pinned.
  - Analytics and the report dialog are restyled.
  - Teaching is at `/c/:slug/learning/teaching`, and course pages show Teaching Assistants.
- **Platform Admin and System health (agent 4):**
  - Every screen is restyled. Tables become cards on phones, and on phones the menu is a searchable section list.
  - Sections show by permission (`useStaffAccess()`).
  - The older browser-only tools sit behind the new `admin.legacy` flag (migration 021, off).
  - The System health screen.
- **Colour pass (agents 5 and 6):** every use of the stock white, slate, rose, emerald, amber and orange palettes in `src` moved to the `--az-*` tokens: 31 live files and 24 parked-module files. Video surfaces in Live stay dark on purpose. **`light-invert.css` is retired.** `source-rules.test.js` now fails if those palettes come back.
- **Mine:**
  - Settings sections keep their address in `Community.jsx`.
  - The Teaching route and the new Queue in Manage.
  - The Administration link for every staff role.
  - `/me/permissions` lists `templates.manage` and `institutions.manage`.
  - The Overview's waiting-accounts count read the wrong status, so it was always 0. Fixed.
  - Health gained the applied migrations, 14-day failure counts per job, and the environment.
  - Settings, General shows the template a community came from and who last changed it (F6; server sends it to Owners and Admins only; test in `g-management.test.js`).
  - Teaching Assistants can open lessons.
  - Manage pages no longer scroll sideways on phones: the hidden "waiting:" label escaped its tab.
  - Selected tiles use the focus colour.
- **Checked:**
  - Full `npm run test:server`: 432 of 432.
  - `npm run test:e2e`: 23 passed, 1 skipped.
  - `vite build` passes, and `source-rules.test.js` passes 3 of 3.
  - Browser: the Calendar in light and dark mode, and the People directory in dark mode, at phone width, with no sideways scroll at 375 px.
  - Each agent checked its own screens on its own server.
- **Not done:**
  - "Roles in use" can be edited, but nothing reads it yet.
  - The Moderator view and Administrative Mode in the new settings weren't exercised (no seeded Moderator).
  - The parked modules' new colours weren't looked at in a browser.
  - Retry on a failed email and the `data_not_persistent` warning weren't seen live: there's no failed email in the seed, and the warning only appears in production.
  - No test for the waiting-accounts fix.

### v2 — Workstream H: responsive, accessibility, security and final QA (12 Nov 2026)

The full report is in `QA_REPORT.md`. In short:

- **Audit tool:** `e2e/audit.spec.js` + `e2e/audit-checks.js`, run with `npm run test:audit`. It crawls every in-app link as four roles and checks each screen at 375, 768 and 1280 px plus dark mode: reflow, 24 px targets, contrast, names from Chrome's accessibility tree, headings, landmarks, ids and focus. The final run covered 161 screens with 0 findings. `AUDIT_STRICT=1` fails on any finding.
- **Accessibility fixes:**
  - `--az-on-tint` for accent text on the tint (4.34:1 → 5.3:1).
  - `.link`/`.hit` reach 24 px.
  - Heading levels on community Members, Events, Manage, Explore, the post page and phone Administration.
  - Unique id for "Next event".
- **Security fixes** (review by a second agent; tests in `server/test/h-security.test.js`, H-S1 to H-S10):
  - The member-state route no longer adds, approves, blocks or un-removes people for Moderators (high).
  - The server trusts one proxy hop (`TRUST_PROXY_HOPS`), so the rate limits can't be bypassed.
  - Staff can't suspend or sign out people with a role they couldn't assign.
  - Members lists respect "List me in member directories" and blocks.
  - `GET /connections/:id` hides blocks.
  - Suspended communities are read-only for their own staff (`requireChangeable`).
  - Reactivation uses the lockout.
  - Merged links don't reveal a Closed home.
  - `/admin/confirm-password` is limited to 5 a minute.
- **Rule changed:** a member with the directory listing off is no longer listed in Members, as the setting promises. This replaces "listed without education" (test in `communities.test.js` updated).
- **Checked:**
  - `npm run test:server`: 442 of 442.
  - `vite build` passes.
  - Screenshots of community Overview, Discussions and Explore at 1280 and 375 px after the link change.
  - `npm run test:e2e`: each full run had one journey fail, a different one each time (`/` search focus, then create-from-template), on a heavily loaded machine. Each passes when run alone.
- **Not done:**
  - H-S9 (file access by owner object).
  - The account-enumeration half of H-S7.
  - The AppSail proxy-hop check. These are the decisions in `QA_REPORT.md` §4.
  - No screen-reader walkthrough and no Moderator role in the crawl.
