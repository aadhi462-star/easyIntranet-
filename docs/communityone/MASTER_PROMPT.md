# CommunityOne — Master Development Prompt (user's brief, saved 10 Nov 2026)

This is the user's governing brief, condensed faithfully. It ranks above everything else in `docs/communityone/`. Where it conflicts with the three reference documents, the latest agreed decision wins and conflicts are flagged (see PHASE0_ASSESSMENT.md §8).

**Identity:** CommunityOne — *One Platform. Every Community.* A unified community ecosystem with integrated learning management. It is an evolution of the existing Alumni Zone-style app, not a new app. Keep valuable functionality and data. Act as senior product architect, UI/UX designer, full-stack engineer, security engineer and QA specialist.

## 1. Reference documents (primary requirements)
1. Community_Platform_Conversation_Consolidated.docx: requirements, roles, permissions, workflows, rules.
2. Community_Platform_Comprehensive_Edge_Cases.docx: 244 scenarios across 20 areas. This is mandatory, not optional.
3. Alumni_Zone_Revamp_Product_Roadmap.docx: the phased roadmap.

## 2. Inspect first
Inventory the existing app and classify every feature as Keep / Improve / Replace / Remove / Investigate. Identify migration needs. **Never delete or overwrite user data, alumni records, communities, files or relationships without a verified migration and recovery strategy.** Assess and plan before major architectural changes. *(Done: PHASE0_ASSESSMENT.md.)*

## 3. Vision
Supported community types: alumni, educational, professional, interest-based, learning, organisation/institution and private/invite-only. The alumni experience stays as an important use case. Journey: Discover → Connect → Join → Participate → Learn → Contribute → Create. The community is the primary unit; one account belongs to many communities, with a different role in each.

## 4. Structure
- **Platform navigation:** Home, Explore, My Communities, My Learning, Events, Saved, Notifications, Profile.
- **My Learning** is an overview across communities, never a separate LMS workspace.
- **Inside each community:** Overview, Discussions, Learning, Events, Resources, Members, About, Settings.
- **Learning** is that community's integrated LMS module, never a standalone product.

## 5. Community types and access
- **Public:** discoverable; permitted content is visible to visitors; join instantly; participation is configurable.
- **Private:** discoverable; basic info visible; discussions, member details and resources restricted; join by request; owner or admin approves.
- **Closed / invite-only:** hidden from discovery, search, recommendations and directories; needs a valid invitation. Expired, revoked or forwarded invitations never grant access.
- Enforce on the backend and API, never by hiding UI alone.
- No leaks through search, notifications, email previews, file URLs, caches or direct API calls.
- Keep the intended destination through sign-up and sign-in.

## 6. Accounts and profiles
- **Profile fields:** name and image, headline and bio, education and institution, department and batch, employment and experience, skills and interests, location and contact preferences, memberships, contributions and learning activity.
- **One account across the platform**, with a full lifecycle: register, login, verification, password recovery, activation, suspension, deactivation and deletion.

## 7. Community creation and management
- **Guided wizard:** basics, then branding (logo and cover), then visibility, then membership and participation permissions, then guidelines, then preview and publish.
- **Community features:** discovery, requests, invitations, discussions, posts, comments, reactions, polls, announcements, events, resources and notifications.
- **Owner/Admin dashboards.**
- **Handle:** duplicate submissions, failed uploads, network interruptions, invalid fields, a suspended creator, and ownership transfer. Never auto-delete a community when its creator leaves or is suspended.

## 8. Roles and permissions
- **Platform roles:** Super Admin, Platform Admin, User Manager, Community Manager, LMS Manager, Trust & Safety Moderator, Finance Manager (if needed), Support Agent.
- **Community roles:** Owner, Admin, Moderator, Instructor, Teaching Assistant, Member/Learner.
- **Membership states** (separate from roles): Pending, Invited, Restricted, Removed, Blocked.
- **Granular permissions** for membership, invitations, discussions, content, events, resources, courses, assessments, moderation, analytics and settings.
- **Enforcement:** on the backend; no privilege escalation.

## 9. Platform Admin global override
- **Scope:** unrestricted access to every community, including Private and Closed. That covers viewing everything and changing visibility and settings; managing owners, admins, moderators, members, requests and invitations; creating, editing, publishing, suspending, archiving and permanently deleting communities; managing courses, instructors, lessons and enrolments everywhere; moderating, investigating, suspending and reactivating accounts; overriding community permissions; and platform analytics and audit logs.
- **Normal Mode vs Administrative Mode:** Normal Mode follows ordinary membership rules. Administrative Mode is clearly indicated, never adds membership and never inflates counts.
- **Limits:** the override never bypasses authentication, audit logging, security controls or privacy obligations. Super Admin alone controls critical security configuration and assigning Platform Admins.

## 10. Integrated LMS (inside each community)
- **Courses:** creation, categories, instructors, objectives, visibility and enrolment rules; modules and lessons with video, text, slides, PDFs and external resources.
- **Assessment:** quizzes and question banks; assignments and submissions; deadlines, grading and feedback.
- **Completion:** progress tracking, completion criteria and certificates.
- **Around the course:** course discussions and Q&A, and learning analytics.
- **Instructor/TA powers** apply only within their assigned communities.
- **Course access:** public, members-only or restricted.
- **Privacy:** individual performance is visible only to authorised instructors and admins; owners and admins get aggregate reports.
- **Journey:** discover, join, open Learning, browse, enrol, lessons, assessments, feedback, completion, certificate. No standalone LMS dashboard.

## 11. Dashboards
- **Member:** joined communities, activity feed, My Learning overview, upcoming events, saved resources, notifications, recommended communities.
- **Owner/Admin:** overview, members, requests, discussions/content, learning management, events/resources, moderation, analytics, settings.
- **Moderator:** pending reports, categories, content to review, restrictions/warnings, resolution history, workload.
- **Instructor:** assigned courses, enrolments, lesson progress, submissions, grading/feedback, course discussions, learner performance.
- **Platform Admin control centre:** overview, user/community growth, active users, activity, learning usage, pending moderation, reports, analytics, recent admin activity, system health and audit logs.

## 12. Community settings (Owner/Admin)
- **Areas:** General & branding, Privacy & visibility, Membership & invitations, Roles & permissions, Discussions & content, Learning, Events & resources, Notifications, Moderation & safety, and a Danger Zone. Community settings never override platform policy.
- **Deletion:** community admins never permanently delete. They use **Request Community Deletion**:
  - The request records the reason, community, requester, timestamp and status, and emails the Platform Admin. The internal queue is the source of truth.
  - The Platform Admin reviews members, courses, learners, reports, payments and obligations, then approves or rejects with a reason.
  - The requester is notified, and every step is audit-logged.
- **Only the Platform Admin** permanently deletes.

## 13. Platform Admin settings
Branding/info, registration and authentication, community creation and policies, global roles and permissions, Learning availability and LMS policies, content and file limits, notifications, security, integrations and APIs, billing (if monetised), privacy and compliance, and maintenance, backups and monitoring. **If Learning is disabled globally, no community can enable it.**

## 14. Analytics
- **Levels:** platform (registrations, active users, growth, DAU/WAU/MAU, content, retention, learning, moderation, performance), community (members, growth, retention, content, engagement, events, resources, courses), instructor and member.
- **Tools:** date filters, period comparison, authorised drill-down and exports. Protect individual-level data.
- **North star:** Weekly Meaningfully Active Members (WMAM).

## 15. Security, reliability, integrity
- **Coverage:** authentication and authorisation, backend permission checks, sessions, passwords, optional 2FA, validation and sanitisation, protection against SQLi/XSS/CSRF, secure files, rate limits, API access control, audit logs, backup and recovery, migration validation, error handling and monitoring, and privacy-aware notifications and search.
- **Never rely on the frontend alone.**

## 16. Edge cases and QA
- **Coverage:** execute all 244 scenarios throughout.
- **Priorities:** Private/Closed access, roles, admin override, Administrative Mode and audit, suspended users, ownership transfer, deletion approval, LMS enrolment and access, assessment integrity, files, notification and search privacy, data integrity and migration, and performance and responsiveness.
- **P0 security, access-control, escalation and integrity issues block release.**
- **Record** results, failures, fixes and outstanding issues. A feature is complete only when its full workflow is tested, including the backend and failure cases.

## 17. UI/UX and brand
Use CommunityOne branding everywhere: login and registration, navigation, dashboards, community pages, learning, admin, notifications and email templates, page titles and metadata, and docs. The design should be clean and consistent, reusable, responsive (desktop, tablet, mobile), accessible (contrast and keyboard), with meaningful empty, loading, success and error states and role-based navigation. Avoid clutter and excessive animation. Preserve useful existing patterns.

## 18. Roadmap order (one phase at a time)
- **Phase 0:** assessment and preparation.
- **Phase 1:** core platform revamp and the alumni experience (auth, profiles, directory, institutions and batches, connections, feed, announcements, events foundation, user dashboard, platform admin).
- **Phase 2:** community expansion (creation, discovery, Public/Private/Closed, memberships, invitations, roles, discussions, events, resources, moderation, notifications, community dashboards and settings, a basic Learning section, admin override, Administrative Mode, audit logs, deletion requests).
- **Phase 3:** full LMS (lessons, enrolment, assessments, assignments, grading, feedback, certificates, Instructor/TA, course discussions, learning analytics).
- **Phase 4:** maturity (reporting, integrations, APIs, performance, reliability, backups, monitoring, optional monetisation).
- **Phase 5:** AI (knowledge assistant, summaries, semantic search, duplicate questions, recommendations, learning assistance, admin summaries). Only after Phases 1–4 are stable, respecting all access controls, with human review kept for high-impact actions.

## 19. Workflow
Inspect, read the docs, document, find gaps and risks, propose the architecture, plan the phases, implement one phase at a time, test features and edge cases, review security, validate data, **get approval before destructive or major architectural changes**, and document completed work and remaining issues. Avoid duplication, temporary workarounds, hard-coded permissions and mock functionality. No fake data or placeholders in production workflows, and never claim done before end-to-end testing.

## 20. Final expectation
A reliable, scalable CommunityOne that:
- keeps and improves the alumni experience;
- supports many community types under one account;
- enforces Public, Private and Closed;
- has granular platform and community roles, and an audited Platform Admin override;
- includes a Learning module in every community;
- has role dashboards and analytics;
- provides secure content, events, resources and discussions;
- handles the edge cases;
- works on desktop and mobile;
- is maintainable;
- adds AI only last.
