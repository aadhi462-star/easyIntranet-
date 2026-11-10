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

Next: step 4b, web app (Feed and Groups use the API).
