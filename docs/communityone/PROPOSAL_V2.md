# CommunityOne — Proposal and ETA for the v2 master brief

12 Nov 2026. Answers Part 1, step 4 of `MASTER_BRIEF_V2.md`. Based on an inspection of the code at commit `9b0ca15`; every count below was measured, not estimated. **Approved by the user on 12 Nov 2026 ("Approve, recommended"), with the recommended answers to P1–P5.** Work starts with workstream A.

## 1. Existing task: Stage 7 is complete

Platform administration is built, tested and pushed (`c65b0b9`, `9b0ca15`). Details are in `PHASE0_ASSESSMENT.md` ("Redesign Stage 7").

- **Covers:** users, communities, deletion with a 30-day restore, the moderation centre, settings, announcements, the activity log and analytics.
- **Tests:** 253 server tests pass when each file runs on its own.
- **Open issue:** the single full-suite command sometimes stalls; the cause isn't found yet.
- **Not checked in the browser:** the password prompt dialog, deciding cases from the centre, and CSV downloads.

## 2. Current application, as it is

| Area | What exists |
| --- | --- |
| Size | About 21,000 lines in `src/` (154 files, 39 pages); about 10,500 in `server/` (191 routes, 12 migrations). |
| Server | Node + Fastify + PostgreSQL (PGlite locally). Sessions, CSRF, idempotency, audit log, one `access()` permission function, Administrative Mode. |
| On the server | Accounts, profiles and directory, connections, communities and memberships, discussions with topics and attachments, events, resources, notifications, saved items, learning (courses, quizzes, assignments, certificates), moderation, community management, platform administration. |
| Still browser-only | Forums, channels, tasks and boards, files, ideas, town halls, surveys, leaderboard, manuals, custom apps, live, web tabs, workflows and schedulers, user labels, policies, branding. Several feed widgets and Search still read old local `state.posts` and `state.events`. |
| Tests | 253 server tests (`node --test`). No client tests and no end-to-end tests. |
| Hosting | One Catalyst AppSail service. Data lives in files in the app folder and isn't confirmed to survive a redeploy, so a managed PostgreSQL is needed before real members. |

## 3. Architectural changes required

1. **End the default community (Part 2.1).**
   - AlumniZone is hardcoded in about 25 server places and 40 client places. The main ones: `DEFAULT_COMMUNITY` and `joinDefaultCommunity` (auto-join on email verification and on approval), the seed, the All Hands merge, the suspend and delete guards, `NETWORK_ID` / `NETWORK_COMMUNITY` in the client, the Feed "wall", the Composer default, the Events "All of AlumniZone" scope, the Landing and About sections, the Welcome text, and sort-first rules.
   - All of these go. New accounts join nothing automatically.
2. **Make communities configurable from data, not code.**
   - Add a category list (the 8 template categories plus "Other").
   - Store logo and cover images in the existing file store.
   - Enforce module enable/disable: `settings.apps` is stored today, but the client ignores it.
   - Add per-community notification defaults.
   - Add invitations for Closed communities (the `invited` membership state exists, but there is no route).
3. **Templates (Part 4, new).** Add `community_templates` and `template_versions` tables.
   - A version holds a questionnaire and a configuration blueprint.
   - A community records the template and version it came from, and copies the configuration at publish time. Editing a template therefore never changes existing communities.
   - Template administration lives in Platform Admin.
4. **Feature flags are enforced.** The `feature_flags` table exists, but no route or screen reads it. The server will refuse parked modules, the client will drop their routes (today they're reachable by URL), and the Learning switch will work.
5. **System health in Platform Admin.** Database status and size, job runner last run and failures, email outbox failures, and the storage used.
6. **No change to the core stack.** Auth, sessions, `access()`, the database and the API contracts stay.

## 4. AlumniZone migration and preservation strategy

The data in the `alumnizone` community today:

- 34 memberships, all added automatically
- 6 network-wide posts with their comments and reactions
- 3 events
- the merged All Hands group

The brief forbids auto-creating or auto-assigning, but also forbids deleting data. Proposed (**decision P1**):

- **Data:** migration 013 turns `alumnizone` into an ordinary Public community named "AlumniZone", category Alumni. Its posts, events, authors and timestamps are kept. It's no longer special: it can be suspended or deleted, isn't pinned first, and nobody joins it automatically.
- **Memberships:** members who took part (posted, replied, reacted, RSVP'd) stay members. Members who were only added automatically are moved to "left", which keeps the record and lets them rejoin in one click. Nobody is silently given new permissions; staff roles are kept as they are. A migration log lists every changed row, and a script undoes the change (same pattern as `undo-merge.mjs`).
- **Seed:** creates no default community. Demo data puts its alumni content in an Alumni demo community created through the new template flow.
- **Profiles:** institutions, departments and graduation years stay as personal profile data (they're about the person, not a community). The platform directory stops assuming everyone is an alumnus; batch filters move into Alumni-template communities.
- **Browser-only modules:** they hold demo data in each browser, not server data. They stay parked behind flags, with their routes removed. Nothing is migrated, because nothing server-side exists.
- **Safety:** backup before running (PGlite folder copy; `pg_dump` on PostgreSQL), the migration rehearsed on a copy of the seeded database, and the result checked against a before/after count report.

## 5. Community creation and templates

- **Start screen:**
  - "Use a template": cards for the 8 categories, each with a description of what it sets up.
  - "Start from scratch".
- **Template path:** answer that template's questions (Alumni asks for institution, graduation years, departments, who can join and networking goals; Education asks for subjects, student groups, instructors and objectives; and so on). The answers generate a suggested configuration: name, description, sections, discussion topics, roles in use, permissions, membership rules, event and resource categories, learning settings and guidelines.
- **Shared steps:** Configure (everything editable), Preview (the real community page with sample content clearly marked as preview only), Validate, Publish. The creator becomes Owner.
- **Scratch path:** goes straight to Configure, with no questions.
- **Server:** checks every field again, and creating twice returns the first result (idempotency).
- **Template administration:** create, edit, publish a new version, deactivate, see usage. An inactive template is hidden from creation; communities already made from it keep working.
- **Tests:**
  - Two communities from one template stay independent.
  - An inactive template can't be used.
  - A version change doesn't touch existing communities.
  - Invalid configuration is refused.
  - Duplicate submits create one community.

## 6. UI/UX audit findings

| Finding | Measured |
| --- | --- |
| The theme is dark-first, and light mode works by inverting colour scales (`light-invert.css` turns `white` dark) rather than using semantic tokens. | `:root` is dark; `index.html` falls back to dark. |
| Hardcoded colour utilities bypass tokens. | 1,617 in 111+ files: `text-white` 345, `text-slate-*` 408, `brand-*` 231, rose/red 203. Worst files: Channels, Events, Community, PostCard, Dashboard. |
| Emojis are used as icons, logos and labels. | 497 in `src/` (61 files) and 19 in server seed data. `Glyph` renders unmapped emoji as text. Every module icon, the community `emoji` field and 33 of 49 empty states use them. |
| No icon library. | A custom SVG set of about 90 icons; `lucide-react` isn't installed. |
| "Glass" naming and a few gradients remain. | `.glass` 257 uses (already a solid surface, so a rename); 10 `brand-gradient`; 1 real gradient. |
| Navigation doesn't match the brief. | The sidebar has a "More" group (Feed, People, Calendar, Saved). Notifications are only a bell; Profile is only a footer link; Bookmarks duplicates Saved. The mobile bar has Events instead of Notifications. Signed-in users land on `/feed`, not Home. |
| Parked modules are reachable by URL. | 15 legacy pages register routes unless hidden; only OrgChart is hidden. |
| Duplicated components. | 3 stat tiles, 3 people pickers, 2 section wrappers, local Card and Badge variants. Loading states are mixed (37 ad-hoc pulses). 54 native `confirm()` dialogs. |
| Landing doesn't match the brief. | Nav lacks Features and Learning. AlumniZone is featured and pinned first. There are no product previews, only tiles and search. "Join free" should be "Get Started". |
| Accessibility. | Good bases: Modal focus trap, labelled fields, 44 px buttons. Gaps: emoji announced by screen readers, native `confirm()`, contrast not yet measured on the new palette. |

## 7. Proposed visual direction

- **Light-first** using the brief's tokens: background `#F7F8F6`, surface `#FFFFFF`, text `#17211F`, secondary `#697570`, accent `#168C70`, border `#E6EBE7`. Contrast, measured against WCAG 2.2:

| Pair | Ratio | Result |
| --- | --- | --- |
| Text `#17211F` on `#F7F8F6` | 15.5:1 | Passes |
| Secondary `#697570` on `#F7F8F6` | 4.50:1 | Passes AA exactly (on white, 4.8:1) |
| Accent `#168C70` on white | 4.18:1 | **Fails AA for normal text** |
| White on an accent button | 4.18:1 | **Fails** |
| Accent on `#F7F8F6` | 3.93:1 | **Fails** |

Proposed fix (**decision P5**): keep `#168C70` for large text, icons, focus rings and fills that don't carry small text. Add a slightly darker accent, `#127A61` (measured: 5.27:1 on white, 4.95:1 on `#F7F8F6`, both passing AA), for links, small accent text and button fills under white text.
- **Dark mode** stays as an option, built from the same semantic tokens rather than inverted scales.
- **Inter** with one type scale (page, section, sub-heading, body 15–16 px, label, metadata never under 12 px).
- **Icons:** Lucide (`lucide-react`, a pinned version) replaces the custom set and every emoji. Community logos become uploaded images, with a lettered tile as the fallback.
- **Components:** one set: Button, IconButton, Input, Select, Textarea, Checkbox/Radio, Dialog, ConfirmDialog (replaces `confirm()`), Menu, Tabs, Table (stacks on phones), Card, Badge, Avatar, EmptyState, Skeleton, Toast.
- **Community identity:** each community keeps its accent colour (now set by the Owner), its logo and its cover. The platform accent is only for platform actions.

## 8. Landing page redesign

- **Nav:** logo, About, Explore Communities, Features, Learning, Sign In, Get Started.
- **Hero:** the brief's headline and line, with Explore Communities (primary) and Get Started. The visual is a composed preview of the real product (a community page with a discussion, an event and a course card), drawn in HTML from the design system, not stock images.
- **Sections:** discovery preview (real Public communities from the API, filtered by category, no AlumniZone pinning), capabilities, how it works, discussions and engagement, events and resources, integrated learning, benefits, final CTA ("Your community is waiting."), footer. Each feature is explained once.
- **No invented numbers:** counts appear only when real.

## 9. Application redesign

- **Desktop sidebar:** Home, Explore, My Communities, My Learning, Events, Saved, Notifications, Profile. Your communities listed beneath, and Create Community. Administration only for staff.
- **Mobile bottom bar:** Home, Explore, Communities, Notifications, Profile. Signed-in users land on Home.
- **Home:** a welcome, then items ranked by relevance (replies to you, required reads, upcoming events, learning in progress, new in your communities, recommended Public communities).
- **Explore:** search, category filters, cards with logo, members, visibility, your status and the right action.
- **My Communities:** only real memberships and communities you manage, with role and status.
- **Community pages:**
  - Header with cover, logo, name, category, members, visibility and actions.
  - Sections Overview, Discussions, Learning, Events, Resources, Members, About, Settings, showing only the modules that are enabled.
  - Existing working features are reskinned, not rewritten.
- **Feed and People:** move inside Home and the community pages. Local-data widgets that read `state.posts` switch to the server.
- **Role dashboards** (Owner/Admin Manage, Moderator queue, Instructor views, Platform Admin) are restyled onto the new components. System health and template administration are added.

## 10. Pages and components affected

- **Rewritten or new:** Landing, About, Features and Learning marketing sections, `Layout.jsx`, Home, Explore, My Communities, the creation wizard, template admin, system health, invitations, community settings sections, the design-system components.
- **Restyled, same behaviour:**
  - Auth pages, Welcome, Profile and People, Community and its tabs.
  - Discussions (PostCard, Composer), Events, Resources, Notifications, Saved.
  - Learning (catalogue, course, lesson, quiz, grading, certificate), Manage, Administration.
- **Retired from navigation and routes (kept behind flags, files kept):** Feed page, Forums, Channels, Tasks, Files, Ideas, Town Halls, Surveys, Leaderboard, Manuals, Custom Apps, Live, Web Tabs, Org Chart, and the older browser-only admin tools.

## 11. Dependencies and risks

| Risk | Mitigation |
| --- | --- |
| Restyling 111+ files can break working screens. | Tokens first, then screen by screen; each screen checked in the browser at 1280 and 375 px before moving on. Server tests unchanged. |
| No client tests. | Add Playwright smoke journeys for the main workflows (sign up, join, post, RSVP, enrol, create a community from a template and from scratch, admin delete and restore), so later stages catch regressions. Adds testing time; recommended. |
| The AlumniZone migration changes memberships. | Dry-run report, backup, undo script, and P1 needs your answer first. |
| The full-suite stall. | Investigate early in workstream A; the per-file runner is the fallback. |
| Hosting persistence. | Before real members: a managed PostgreSQL (`DATABASE_URL`). This is a decision and cost of yours, and it's outside the estimate. |
| New dependency. | `lucide-react` (MIT), pinned. No other new runtime dependencies. Playwright only for development. |
| Waiting on you. | Approval at each stage gate; Terms of Service text and a contact address (still open); answers to P1–P4. |

## 12. Implementation sequence

Each step ends with a demo and your approval.

1. **A. Architecture and data:** P1 migration, default community removed, flags enforced, full-suite stall fixed, Playwright set up.
2. **B. Design system:** tokens, light and dark, Lucide, the component set, emoji removed, `light-invert.css` retired.
3. **C. Public website:** landing, About, Features, Learning, auth and onboarding.
4. **D. Shell and core:** navigation, Home, Explore, My Communities, Profile.
5. **E. Community experience:** header, branding uploads, enabled sections, Overview, Discussions, Members, Events, Resources, Learning restyle.
6. **F. Creation and templates:** the wizard (template and scratch), questionnaires, preview, publish, template administration, invitations for Closed communities.
7. **G. Management and administration:** remaining community settings sections, role dashboards restyled, system health.
8. **H. Responsive, accessibility, security and final QA.**

## 13. Estimated time per workstream

These are hours of my working time in this codebase, measured against Stage 7, which took about 5 hours including tests and browser checks. They don't include the time each stage waits for your review. Expect ±30%.

| Workstream | Development | Testing | Depends on |
| --- | --- | --- | --- |
| A. Architecture, data, migration, flags, test stability, Playwright setup | 5 h | 3 h | P1 answer |
| B. Design system, tokens, Lucide, components, emoji removal across 61 files | 10 h | 3 h | Approval of the token and component board |
| C. Public website and auth and onboarding | 6 h | 2 h | B |
| D. Shell, Home, Explore, My Communities, Profile | 6 h | 2.5 h | B |
| E. Community experience, branding uploads, module enforcement, restyle of discussions, events, resources, members, learning | 12 h | 4 h | B, A |
| F. Templates, questionnaires, wizard, preview and publish, template admin with versions, Closed invitations | 10 h | 3.5 h | A, E |
| G. Community settings sections, role dashboards, system health, admin restyle | 6 h | 2 h | B, F |
| H. Responsive pass, WCAG 2.2 AA checks, permission and security review, final QA report | 3 h | 5 h | all |
| **Total** | **58 h** | **25 h** | |

**Total: about 83 hours of work (range 60–110), roughly 12–16 working sessions.** Each of the 8 stages also waits for your approval. Outside the estimate: a managed database and production deployment, and writing the Terms of Service.

## 14. Decisions I need from you

- **P1. Existing AlumniZone data.** Keep it as an ordinary community, keep only members who took part, and offer a one-click rejoin (recommended)? Or keep all 34 memberships as they are? Or move its content into a new Alumni community you create?
- **P2. Dark mode.** Keep it as an option (recommended; it costs little once tokens are semantic), or light only?
- **P3. Playwright end-to-end tests.** Add them (recommended, included above)? Or rely on server tests and manual browser checks (saves about 4 hours, with more regression risk)?
- **P4. Parked browser-only modules.** Remove their routes and keep the files behind flags (recommended)? Or delete the files (history stays in git)?

- **P5. Accent contrast.** Add a darker accent for text and buttons so the palette passes AA (recommended)? Or keep `#168C70` everywhere and accept that small accent text fails AA?

Once you approve this proposal and answer P1–P5, I start with workstream A and show you the token and component board before restyling any screen.
