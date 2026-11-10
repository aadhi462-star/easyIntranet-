# CommunityOne — UI/UX, landing page and application redesign brief (user's brief, saved 11 Nov 2026)

Condensed faithfully from the user's redesign prompt. It sits alongside `MASTER_PROMPT.md` (which still governs scope, security and phases); this brief governs the **experience, brand and screen structure**. Where they differ, the latest agreed decision wins and the difference is flagged in the design review.

## Core architecture (must hold everywhere)
- **CommunityOne is the platform; AlumniZone is one community inside it** (the default Alumni community). Never call AlumniZone the platform.
- One account, many communities, a different role in each. Communities: institutions, departments/batches, professional networks, interest groups, learning groups, organisations, private teams.
- Each community has its own identity, membership, discussions, events, resources, settings and **its own Learning section** (LMS stays inside communities; My Learning is only a cross-community overview).
- Platform administration and community administration stay distinct.
- Preserve AlumniZone functionality and data; network-wide content lives in the AlumniZone community with permissions and ownership preserved.

## Brand and design direction
- Keep and mature the existing identity: dark charcoal, lime-green accent, large type, subtle grid, minimal cards, split screens, restrained glow.
- **Inter** typography; modern, minimal, confident, professional; spacious, content-first layouts; subtle borders, controlled radii; lime for primary actions and meaningful highlights only; consistent **outline icons**; restrained motion.
- **No** excessive glassmorphism, gradients, shadows, animation or decoration. Don't copy other products.
- Pattern references (not templates): Circle (community nav, pages, discussions, courses/events), Linear (hierarchy, type, sidebar, tables, admin), Notion (navigation, organisation), Discord (engagement, discussions), Mighty Networks (community + learning).

## Public website
- **Header:** logo + name left; Explore Communities, About, How It Works, Sign In, Get Started right; responsive.
- **Hero:** "Find your people. Build your community." / "Discover communities, connect with people, share knowledge, join conversations and learn together. Everything you need to stay connected, in one place." CTAs: Explore Communities (primary), Get Started. Visual of people, communities, collaboration, learning. Must say what it is, who it's for, what you can do, why join.
- **Community discovery:** types (alumni, educational, professional, interest, learning); real community cards (logo, name, description, category, members, visibility, Join/View). Never expose Closed communities.
- **Capabilities:** discover, discuss, connect, events, resources, learning, professional relationships.
- **How it works:** Discover → Join → Participate → Learn → Contribute.
- **AlumniZone** shown as a featured community inside CommunityOne, never the parent brand.
- **Final CTA:** "Your community is waiting." / "Find a community that shares your interests, goals and ideas." → Explore Communities.
- **Footer:** branding, About, Explore, Help and Support, Privacy, Terms, Contact.
- Requirements: responsive, accessible contrast, real data, **no fake statistics**, no broken links, loading/error states; visitors can browse Public communities before registering.

## Authentication and onboarding
Sign in, create account, forgot/reset password, email verification, activation, invitation acceptance, auth error, expired link (with a clear "send a new link"), account recovery — one consistent identity; errors never dominate. Journey: open → explore Public communities → register → verify → complete profile → join/request → dashboard. Invitations return the user to the intended community.

## Authenticated application
- **Desktop shell:** left sidebar (logo, Home, Explore, My Communities, My Learning, Events, Saved, Notifications, Create Community, Profile); top bar (global search, Create, Help, Notifications, profile); main content with contextual actions, filters, tabs. Consistent everywhere.
- **Mobile:** dedicated navigation (bottom bar: Home, Explore, Communities, Notifications, Profile); contextual community navigation; not a squeezed sidebar.
- **Home dashboard:** welcome, recent and joined communities, recent discussions, announcements, upcoming events, learning progress, recommendations, notifications, saved — prioritised, not everything at once.
- **Explore:** search, category filters, featured / popular / new / recommended; cards with logo, name, description, category, members, visibility, membership status, action (Public: Join · Private: Request to Join · Closed: invitation only and never listed).
- **My Communities:** joined, recently accessed, managed, pending requests, invitations, activity; easy switching.
- **Community experience:** header (logo, cover, name, description, category, members, visibility, membership status, actions); tabs Overview · Discussions · Learning · Events · Resources · Members · About · Settings (Settings only for authorised roles); Overview shows pinned announcements, recent discussions, upcoming events, learning highlights, featured resources, member activity, community info.

## Engagement modules
- **Discussions:** feed, create post, rich text, details, comments, replies, reactions, polls, attachments, categories, pinned, announcements, search/filters, reporting; clear author, time and community context.
- **Members:** directory, search, filters, profiles, role labels, membership status, connection actions, management for authorised roles; private info protected.
- **Events:** discovery, calendar, listing, details, registration, attendance, upcoming/past, creation and management; online and offline.
- **Resources:** library, categories, search, filters, upload, previews, download, details, access restrictions (Files + Manuals map here).

## Integrated learning (inside each community)
Learning overview (featured/available/enrolled courses, progress, categories, instructors); course details (title, description, instructor, objectives, modules, lessons, duration, requirements, enrol); lesson viewer (video, text, PDF, slides, external resources, navigation, completion, previous/next, progress, discussion); assessments (quizzes, question navigation, assignments, submissions, deadlines, grading, feedback, results); certificates; My Learning (cross-community view, no LMS admin); instructor experience limited to authorised communities.

## Management and administration
- **Community Owner/Admin dashboard:** overview, growth, active members, requests, discussions, content, events, resources, learning, moderation, analytics, settings — role-based.
- **Moderator dashboard:** pending reports, details, categories, content review, warnings, restrictions, resolution history.
- **Community settings:** General · Branding · Privacy and Visibility · Membership · Roles and Permissions · Discussions and Content · Learning · Events and Resources · Notifications · Moderation and Safety · Danger Zone. Owners/Admins only; admins **request** deletion, never delete.
- **Platform Admin dashboard (distinct):** overview, users, communities, events, resources/content, learning across communities, moderation centre, reports, restricted accounts, analytics, activity logs, settings, roles/permissions, announcements. Global access including Private/Closed, **Administrative Mode clearly indicated**, never changes membership counts.

## AlumniZone transformation
AlumniZone becomes the default Alumni community. Forums → Discussions · Files + Manuals → Resources · Town Halls → Events · alumni directory → member directory · institutions/departments/batches → structured entities. Tasks, Custom Apps, Web Tabs, Live, Channels, Surveys, Ideas, Leaderboard stay behind feature flags; their data is kept. Migrated content keeps authors, timestamps, attachments, comments, visibility and audit data; nothing restricted becomes public.

## Design quality
- **Design system:** tokens for colour, spacing, type, borders, shadows, radius, layout, breakpoints, interaction states; reusable buttons, inputs, search, dropdowns, tabs, cards, tables, modals, drawers, tooltips, badges, avatars, notifications, forms, empty/loading/error states.
- Desktop, laptop, tablet, mobile; no horizontal overflow; usable touch targets.
- **Accessibility:** WCAG 2.2 AA where practical — keyboard, visible focus, contrast, semantic HTML, accessible forms, screen readers, alt text, reduced motion.
- **Every visible control works** (loading, success, error, empty, hover, active, disabled, validation, confirmation). No decorative buttons, no fake functionality.
- Consistent terms: Platform, Community, Member, Community Owner, Community Admin, Moderator, Instructor, Learner, Platform Admin. Learning is never "a separate application"; platform and community navigation never mix.

## Execution order (approval before each major stage)
1. **Foundation** — branding, tokens, type, palette, components, navigation, responsive base.
2. **Public website** — landing, explore preview, discovery, About, auth, registration, onboarding.
3. **Core application** — Home, Explore, My Communities, Community Overview, Profile, global search.
4. **Engagement** — Discussions, Members, Events, Resources, Notifications, Saved.
5. **Integrated learning** — community Learning, catalogue, course, lesson viewer, assessments, certificates, instructor, My Learning.
6. **Management** — owner/admin/moderator dashboards, community settings, membership, learning management, community analytics.
7. **Platform administration** — admin dashboard, users, communities, global settings, reports, analytics, activity logs, Administrative Mode.
8. **Polish and QA** — responsive, accessibility, interactions, performance, consistency, permissions, edge cases.
AI stays last.

## Working rules
- Before implementing: inspect the app, read the documents, then present the **screen inventory, proposed IA, user journeys, design system proposal, and wireframes** (landing, app shell, community page, role dashboards).
- Before each stage: present layouts, navigation, interactions, mobile behaviour, reused components, and validation against requirements; **get approval**.
- Technical: keep working backend functionality, the approved architecture and the database unless justified; preserve data and relationships; enforce permissions on the backend; protect Private/Closed content; real data, not placeholders; test whole workflows; keep migration and rollback procedures; no incomplete or non-functional UI.
