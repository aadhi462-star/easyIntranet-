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
