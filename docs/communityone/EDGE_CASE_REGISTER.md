# CommunityOne — Edge Case Register

Source: *Community_Platform_Comprehensive_Edge_Cases.docx* (244 scenarios, 20 areas). Phase = the delivery phase in which the case must pass (see `PHASE0_ASSESSMENT.md` §11). P0 cases block their phase.

Last updated 11 Nov 2026 (Phase 1 steps 1–4c, redesign Stages 1–2). Status values: **Not run**, **Pass**, **Fail**, **Blocked**. "Evidence" links the automated test or the browser check that proves the result.


## Summary by phase

| Phase | P0 | P1 | P2 | Total |
| --- | --- | --- | --- | --- |
| 1 | 17 | 16 | 1 | 34 |
| 2 | 75 | 70 | 16 | 161 |
| 3 | 7 | 11 | 0 | 18 |
| 4 | 10 | 9 | 4 | 23 |
| All | 1 | 4 | 3 | 8 |
| **Total** | 110 | 110 | 24 | 244 |


## 1. Registration, Login and Account Lifecycle

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| REG-01 | P0 | 1 | User registers with an email address already linked to an account. | Reject duplicate registration or route the user to sign in/account recovery; do not create a duplicate identity. | Pass | server/test/auth.test.js REG-01; browser 10 Nov: duplicate sign-up refused |
| REG-02 | P0 | 1 | Two registration requests for the same email arrive simultaneously. | Only one account is created; the other request receives a clear duplicate response. | Pass | server/test/auth.test.js REG-02 (4 simultaneous → 1 account) |
| REG-03 | P1 | 1 | User submits an invalid email or malformed phone number. | Validate format and explain the correction required; do not persist invalid contact data. | Pass | server/test/auth.test.js REG-03 (email + password; no phone field exists yet) |
| REG-04 | P1 | 1 | User never verifies their email/phone. | Keep account in an unverified state and restrict actions according to policy; do not treat it as fully active. | Pass | server/test/auth.test.js REG-04; browser 10 Nov: sign-in before confirming refused, resend offered |
| REG-05 | P1 | 1 | Verification link is expired, already used, malformed or revoked. | Reject it safely and provide a way to request a fresh verification link. | Pass | server/test/auth.test.js REG-05/06; browser 10 Nov: reused link refused |
| REG-06 | P1 | 1 | User requests multiple verification links; an older link is used after a newer one is issued. | Only the currently valid token succeeds, or token policy is applied consistently; no conflicting account state. | Pass | server/test/auth.test.js REG-05/06 (older link superseded) |
| REG-07 | P1 | 1 | Verification email/SMS delivery fails or is delayed. | Show a retry/resend path and preserve the pending account without creating duplicates. | Not run | |
| REG-08 | P0 | 1 | User changes their email/phone to one already used by another account. | Reject the change and retain the existing verified contact information. | Pass | server/test/auth.test.js REG-08/09 (incl. address taken before confirmation) |
| REG-09 | P1 | 1 | User changes email/phone but does not complete re-verification. | Mark the new contact as pending; do not silently replace the verified contact. | Pass | server/test/auth.test.js REG-08/09 |
| REG-10 | P0 | 1 | User requests password reset for an unknown email. | Return a privacy-safe response that does not reveal whether an account exists. | Pass | server/test/auth.test.js REG-10; browser 10 Nov: same message for any email |
| REG-11 | P1 | 1 | Password reset link is expired, reused or requested repeatedly. | Reject invalid tokens, rate-limit abuse and allow a fresh reset request. | Pass | server/test/auth.test.js REG-11/12 + rate limiting |
| REG-12 | P0 | 1 | User changes password while other sessions are active. | Apply the defined session-revocation policy; invalidate compromised sessions/tokens where required. | Pass | server/test/auth.test.js REG-11/12, REG-12 change; browser 10 Nov: reset signs out everywhere |
| REG-13 | P0 | 1 | Account is suspended while user is logged in on another device. | Revoke or block protected actions across sessions and APIs promptly. | Pass | server/test/admin.test.js REG-13/USR-06; browser 10 Nov: revoked session signs the tab out on focus |
| REG-14 | P1 | 1 | Deactivated user attempts to log in or register again with the same identity. | Apply the account reactivation/deletion policy; do not create an unintended duplicate identity. | Pass | server/test/auth.test.js REG-14 |
| REG-15 | P0 | 1 | User deletes their account while they own a community or teach courses. | Require ownership/course transfer or a managed handover before deletion completes. | Pass | server/test/auth.test.js (Super Admin) + server/test/communities.test.js REG-15 / COM-09 (community ownership); courses join in Phase 3 |
| REG-16 | P1 | 1 | User has multiple tabs submitting registration or profile changes. | Prevent duplicate creation and resolve conflicting updates predictably. | Pass | server/test/auth.test.js idempotent retry; browser 10 Nov: double click → one account, one email |
| REG-17 | P0 | 1 | Login attempts exceed allowed limits or originate from suspicious patterns. | Apply rate limits, throttling or additional verification without exposing security details. | Pass | server/test/auth.test.js REG-17 lockout + rate limiting |
| REG-18 | P0 | 1 | User attempts to use a revoked session, API token or refresh token. | Reject the request and require fresh authentication. | Pass | server/test/auth.test.js REG-18 |

## 2. Profile and User Management

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| USR-01 | P1 | 1 | User submits a blank name or required profile field. | Reject invalid required fields and identify what must be completed. | Pass | server/test/profiles.test.js USR-01; browser 10 Nov: blank name caught in Edit profile |
| USR-02 | P0 | 1 | Profile contains very long text, unsupported characters or script/HTML payloads. | Enforce limits and safely encode/sanitise displayed content. | Pass | server/test/profiles.test.js USR-02 (stored as text, escaped on display; control chars dropped; length limits) |
| USR-03 | P1 | 1 | User uploads an unsupported, oversized or corrupted avatar/cover image. | Reject the file with a clear explanation; retain the previous image. | Blocked | Avatars are generated initials; image upload arrives with secure file storage (Phase 2) |
| USR-04 | P1 | 1 | User removes a profile photo while cached copies remain. | Use the default image and ensure private media is not exposed through stale URLs. | Blocked | Same as USR-03 |
| USR-05 | P2 | 1 | User changes display name while posts and comments exist. | Update profile references consistently without breaking attribution or audit records. | Pass | server/test/profiles.test.js USR-05 (directory reflects new name) |
| USR-06 | P0 | 1 | Platform Admin suspends or reactivates a user while they are actively using the platform. | Apply the status consistently across sessions, communities, events and LMS actions. | Pass | server/test/admin.test.js REG-13/USR-06 |
| USR-07 | P0 | 1 | User is removed from one community but remains a member of others. | Revoke only the relevant community access; preserve other memberships. | Pass | server/test/communities.test.js MEM-08 (other memberships unaffected) |
| USR-08 | P1 | 1 | User requests personal data export or account deletion. | Verify identity, apply retention/legal rules and report completion/failure clearly. | Pass | server/test/profiles.test.js USR-08 (password re-entry; export of account, profile, sessions, activity) |
| USR-09 | P1 | 1 | User is deleted but their content is retained under a retention policy. | Anonymise or attribute content according to policy; do not leave broken profile links. | Pass | server/test/auth.test.js USR-09; server/test/profiles.test.js USR-09 placeholder profile |
| USR-10 | P1 | 1 | Two administrators edit the same user record simultaneously. | Prevent silent overwrites; show latest state or resolve conflicts with audit history. | Pass | server/test/profiles.test.js USR-10 version check; browser 10 Nov: two-tab edit keeps both changes |

## 3. Community Creation and Setup

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| COM-01 | P1 | 2 | Two users create communities with the same or near-identical names. | Apply the agreed uniqueness policy; show a useful conflict message without creating duplicates. | Pass | server/test/communities.test.js COM-05/COM-01 |
| COM-02 | P1 | 2 | Community name contains prohibited terms, impersonation or misleading branding. | Reject or route for review under platform policy. | Not run | |
| COM-03 | P1 | 2 | Description is empty, too long or contains unsafe markup. | Validate length and safely render allowed formatting only. | Not run | |
| COM-04 | P1 | 2 | Logo or cover upload fails midway. | Do not publish a broken asset; allow retry and preserve other entered setup data. | Not run | |
| COM-05 | P0 | 2 | User double-clicks Create or retries after a slow response. | Create one community only; return the existing result for an idempotent retry. | Pass | server/test/communities.test.js COM-05 create idempotent |
| COM-06 | P0 | 2 | Network drops after server creates community but before client receives confirmation. | On retry, detect the existing creation and avoid duplicates. | Not run | |
| COM-07 | P1 | 2 | Platform Admin disables community creation while a user is in the creation wizard. | Block final submission and explain that creation is currently unavailable. | Not run | |
| COM-08 | P0 | 2 | Creator is suspended during setup or immediately after publishing. | Prevent prohibited actions and preserve community ownership through an authorised reassignment process. | Not run | |
| COM-09 | P0 | 2 | Creator account is deleted or becomes inaccessible. | Trigger ownership transfer/recovery; do not orphan the community. | Pass | server/test/communities.test.js REG-15 / COM-09 |
| COM-10 | P1 | 2 | Required category, rules or other mandatory field is missing. | Prevent publication and identify missing fields. | Not run | |
| COM-11 | P1 | 2 | Community requires approval before publication but user expects instant creation. | Show Pending Approval state and prevent premature public discovery. | Not run | |
| COM-12 | P2 | 2 | User opens multiple creation wizards and submits different drafts. | Handle independent drafts safely and prevent accidental cross-population. | Not run | |
| COM-13 | P1 | 2 | Community creation limit per user has been reached. | Block creation with a clear limit explanation and route to existing communities. | Not run | |

## 4. Community Visibility, Privacy and Discovery

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| VIS-01 | P0 | 2 | Visitor opens a private community page directly by URL. | Show only permitted public metadata or an access-denied/join-request state; never expose protected content. | Pass | server/test/communities.test.js VIS-01/02 |
| VIS-02 | P0 | 2 | Visitor opens a private post, file or member profile endpoint directly. | Deny access server-side; do not rely on hidden UI controls. | Pass | server/test/communities.test.js VIS-01/02 + server/test/events.test.js VIS-02/03 (events) |
| VIS-03 | P0 | 2 | Non-invited user opens a closed community URL. | Deny access and do not reveal protected content or member details. | Pass | server/test/communities.test.js VIS-03 + server/test/events.test.js VIS-02/03 (events) |
| VIS-04 | P0 | 2 | Closed community appears in search, recommendations, sitemap or public API. | Exclude it from all public discovery surfaces. | Pass | server/test/communities.test.js VIS-04 + server/test/public.test.js VIS-04 (public, signed-out discovery) |
| VIS-05 | P0 | 2 | Public community changes to Private while a visitor is viewing it. | Recheck permissions on subsequent requests and immediately protect restricted content. | Pass | server/test/communities.test.js VIS-05 + server/test/events.test.js VIS-05 (events) |
| VIS-06 | P0 | 2 | Private community changes to Closed. | Remove it from discovery and require a valid invitation for new access. | Not run | |
| VIS-07 | P1 | 2 | Closed community changes to Public. | Apply public visibility consistently while preserving role and membership rules. | Not run | |
| VIS-08 | P0 | 2 | Search engine or application cache contains content after visibility is restricted. | Purge/invalidate protected cached data; stale caches must not reveal content. | Not run | |
| VIS-09 | P0 | 2 | A previously valid invitation is forwarded to another person. | Apply invitation binding/eligibility rules; forwarded access must not bypass intended restrictions. | Not run | |
| VIS-10 | P0 | 2 | Invitation is expired, revoked or already consumed. | Reject it and show a safe next step; do not grant membership. | Not run | |
| VIS-11 | P0 | 2 | Community member list is configured as private but appears in previews or API responses. | Hide member details everywhere from unauthorised users. | Not run | |
| VIS-12 | P0 | 2 | User is removed or blocked while viewing community content in another tab. | Subsequent requests must fail; cached protected content should be cleared where feasible. | Pass | server/test/communities.test.js MEM-08 / VIS-12 |
| VIS-13 | P1 | 2 | Visibility changes while a join request is pending. | Re-evaluate the request against the new policy; do not auto-grant access unexpectedly. | Pass | server/test/communities.test.js VIS-13 |
| VIS-14 | P1 | 2 | Community is archived but remains in Explore or recommendations. | Remove it from active discovery and clearly communicate archived state to existing members. | Pass | server/test/communities.test.js DEL-01 archive leaves discovery |
| VIS-15 | P0 | 2 | User accesses private media through a copied CDN/file URL. | Require authorised, expiring access rather than relying on URL secrecy. | Not run | |

## 5. Membership, Invitations and Join Requests

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MEM-01 | P0 | 2 | Member clicks Join repeatedly or submits concurrent requests. | Create one membership/request record only. | Pass | server/test/communities.test.js MEM-01 |
| MEM-02 | P1 | 2 | User requests membership and then withdraws before approval. | Mark request withdrawn; later approval must not silently restore membership. | Pass | server/test/communities.test.js MEM-02/03 |
| MEM-03 | P1 | 2 | Admin approves a request that has already been withdrawn or rejected. | Reject stale action and refresh the request state. | Pass | server/test/communities.test.js MEM-02/03 |
| MEM-04 | P1 | 2 | Two admins approve/reject the same request simultaneously. | Persist one valid terminal outcome and record the actor/action in audit history. | Pass | server/test/communities.test.js MEM-04 |
| MEM-05 | P0 | 2 | User is blocked but receives a new invitation. | Block status takes precedence; invitation cannot restore access unless an authorised unblock occurs. | Pass | server/test/communities.test.js removed members not silently restored |
| MEM-06 | P1 | 2 | Community reaches its membership capacity during an approval flow. | Recheck capacity at approval time; queue or reject according to policy. | Not run | |
| MEM-07 | P1 | 2 | User is removed and immediately tries to rejoin. | Apply cooldown/rejoin policy and clearly communicate the result. | Not run | |
| MEM-08 | P0 | 2 | User is removed from one community but still has an active session. | Revoke only that community's access immediately. | Pass | server/test/communities.test.js MEM-08 / VIS-12 |
| MEM-09 | P0 | 2 | Owner attempts to leave without transferring ownership. | Require transfer to an eligible member or prevent leaving. | Pass | server/test/communities.test.js MEM-09 / MEM-10 |
| MEM-10 | P0 | 2 | Last Admin leaves, is suspended or is deleted. | Require another authorised Admin/Owner or trigger recovery workflow. | Pass | server/test/communities.test.js MEM-09 / MEM-10 |
| MEM-11 | P0 | 2 | Invitation is accepted after the inviter loses permission to invite. | Revalidate inviter authority at acceptance; reject invalid invitation. | Not run | |
| MEM-12 | P1 | 2 | Invitation is resent multiple times or to a changed email address. | Invalidate old tokens as appropriate and bind invitation to intended recipient/policy. | Not run | |
| MEM-13 | P1 | 2 | User has a pending request and receives an invitation to the same community. | Resolve to one coherent membership path; avoid duplicate membership records. | Not run | |
| MEM-14 | P0 | 2 | Community becomes full or Closed after an invitation is issued. | Recheck policy at acceptance and deny or queue according to configured rules. | Not run | |
| MEM-15 | P2 | 2 | Membership approval notification is delayed or delivered twice. | Membership state remains authoritative; notifications are deduplicated and do not repeat actions. | Not run | |
| MEM-16 | P0 | 2 | Member is restricted from posting but can still read. | Enforce separate read and participation permissions consistently. | Pass | server/test/communities.test.js MEM-16 |

## 6. Roles, Permissions and Administrative Override

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| PER-01 | P0 | 2 | User is Owner in one community and Member in another. | Resolve permissions using the active community context; never apply the highest role globally. | Pass | server/test/communities.test.js PER-02 / PER-01 |
| PER-02 | P0 | 2 | Moderator attempts to assign themselves Admin/Owner. | Deny unless an explicitly authorised role-granting workflow permits it. | Pass | server/test/admin.test.js role assignment (no self-grant; Platform Admin needs Super Admin) |
| PER-03 | P0 | 2 | Admin removes or demotes the only Owner. | Prevent invalid ownership state and require transfer or another eligible Owner. | Pass | server/test/communities.test.js PER-03 |
| PER-04 | P1 | 2 | Admin removes their own admin role while performing a management action. | Complete or reject atomically; avoid partially applied changes and stale privileged UI. | Not run | |
| PER-05 | P0 | 2 | Role is revoked while user has an open admin page. | Recheck every protected action server-side; hide/disable stale controls after refresh. | Pass | server/test/admin.test.js role changes apply on next request |
| PER-06 | P1 | 2 | Custom role is deleted while assigned to users. | Require reassignment or map affected users to a safe fallback before deletion. | Not run | |
| PER-07 | P0 | 2 | Community Admin attempts to change platform-wide settings. | Deny the action and record suspicious/unauthorised attempts where appropriate. | Pass | server/test/admin.test.js SET-10/PER-07 (denied + audited) |
| PER-08 | P0 | 2 | Platform Admin accesses a Private or Closed community without joining. | Allow access in clearly indicated administrative mode; do not create membership or alter counts. | Pass | server/test/communities.test.js PER-08/10/15 |
| PER-09 | P1 | 2 | Platform Admin performs an action while in normal participation mode. | Apply ordinary membership/role rules and attribute contributions normally. | Pass | server/test/communities.test.js PER-08/10/15 (normal mode) |
| PER-10 | P0 | 2 | Platform Admin performs an action in administrative mode. | Allow permitted global override and record admin identity, target, action, timestamp and context. | Pass | server/test/communities.test.js PER-08/10/15 (audit) |
| PER-11 | P0 | 2 | Community blocks a Platform Admin account at community level. | Community-level block must not override platform authority; account authentication/security status still applies. | Pass | server/test/connections.test.js PER-11 (blocking staff doesn’t limit staff authority) |
| PER-12 | P0 | 2 | Platform Admin account is suspended, compromised or loses authentication. | Do not allow global override without valid authenticated authority; revoke sessions and tokens as required. | Not run | |
| PER-13 | P1 | 2 | Two Platform Admins change the same community settings concurrently. | Prevent silent overwrite and retain a complete change history. | Not run | |
| PER-14 | P0 | 2 | Platform Admin attempts a critical action such as deleting a community or granting admin privileges. | Apply additional confirmation/reauthentication or approval safeguards if configured; audit the action. | Not run | |
| PER-15 | P0 | 2 | Platform Admin is accidentally counted as a community member after admin-mode access. | Do not create membership or alter membership analytics. | Pass | server/test/communities.test.js PER-08/10/15 |
| PER-16 | P0 | 2 | Specialist staff member accesses a module outside assigned scope. | Deny access at API and UI layers; log unauthorised attempts. | Pass | server/test/admin.test.js PER-16 staff scope |

## 7. Posts, Discussions, Comments and Reactions

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| CNT-01 | P1 | 2 | User submits an empty post, comment or reply. | Reject submission with a clear validation message. | Pass | server/test/communities.test.js CNT-01 |
| CNT-02 | P0 | 2 | User double-clicks Publish or retries after timeout. | Create one content item only and return the existing result for a retry. | Pass | server/test/communities.test.js CNT-02; browser 10 Nov: double-click Post → one post, double-click Send → one comment |
| CNT-03 | P0 | 2 | User edits a post while a moderator removes it. | Resolve the race deterministically; removed content must not be republished by a stale edit. | Pass | server/test/communities.test.js CNT-03 |
| CNT-04 | P0 | 2 | Suspended or restricted user attempts to post/comment/react. | Reject actions according to restriction scope and current account status. | Not run | |
| CNT-05 | P1 | 2 | Post is deleted while it has comments/replies. | Apply the defined cascade/retention behaviour; avoid orphaned or inaccessible child content. | Pass | server/test/communities.test.js CNT-07 / CNT-05 |
| CNT-06 | P1 | 2 | Comment author account is deleted. | Retain, anonymise or remove content according to policy; preserve thread integrity. | Not run | |
| CNT-07 | P1 | 2 | User replies to a comment that was deleted moments earlier. | Reject or attach reply to a clearly marked deleted-comment placeholder according to product rules. | Pass | server/test/communities.test.js CNT-07 / CNT-05 |
| CNT-08 | P2 | 2 | User reports the same content repeatedly. | Deduplicate or group reports while preserving report history and reporter identity. | Not run | |
| CNT-09 | P0 | 2 | User attempts to edit/delete another user's content. | Deny unless the user's role explicitly grants moderation authority. | Pass | server/test/communities.test.js CNT-09 |
| CNT-10 | P0 | 2 | Post includes script, malicious HTML, unsafe link or embedded payload. | Sanitise/encode output and apply link/file safety checks. | Not run | |
| CNT-11 | P0 | 2 | Attachment exceeds size/type limit or scanning fails. | Reject/quarantine the attachment; do not publish a downloadable unsafe file. | Not run | |
| CNT-12 | P1 | 2 | Post exceeds character or attachment count limits. | Validate consistently on client and server and preserve draft text where possible. | Pass | stage4 CNT-12: more than 4 attachments, non-image/PDF, someone else’s or reused files are refused with a clear message; the client checks the same before upload |
| CNT-13 | P1 | 2 | Network fails during post submission. | Show uncertain/pending state and allow safe retry without duplicate content. | Not run | |
| CNT-14 | P0 | 2 | Pinned or announced content is edited/deleted by a user without permission. | Deny the change and preserve the content state. | Pass | server/test/communities.test.js announcements, pins (CNT-14) |
| CNT-15 | P0 | 2 | A private discussion is quoted in a public notification preview. | Do not leak protected content in notifications, emails or push previews. | Pass | stage4: email previews never quote content; in-app lines are rebuilt with an access check |
| CNT-16 | P2 | 2 | Reaction is toggled repeatedly or from multiple devices. | Keep one reaction per user/content/type if that is the defined rule; counts remain consistent. | Pass | server/test/communities.test.js CNT-16 |

## 8. Moderation, Reports and Safety

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MOD-01 | P1 | 2 | User reports content that has already been deleted. | Retain report context where policy allows and indicate that content is no longer available. | Not run | |
| MOD-02 | P2 | 2 | Multiple users report the same content. | Group duplicate reports while preserving each reporter's submission and evidence. | Not run | |
| MOD-03 | P0 | 2 | Moderator attempts to investigate a community outside assigned scope. | Deny access unless Platform Admin authority or explicit assignment applies. | Not run | |
| MOD-04 | P1 | 2 | Moderator acts on a report that another moderator has already resolved. | Show latest state and prevent duplicate/conflicting action. | Not run | |
| MOD-05 | P1 | 2 | Moderator issues a warning/restriction to the wrong user or content. | Require clear target context and confirmation; record reversible action history. | Not run | |
| MOD-06 | P2 | 2 | A user appeals a moderation action. | Create an appeal record and route it to an authorised reviewer who is not improperly conflicted. | Not run | |
| MOD-07 | P2 | 2 | Blocked keyword incorrectly flags legitimate content. | Provide review/override path and avoid irreversible automated deletion without policy basis. | Not run | |
| MOD-08 | P1 | 2 | Spam or harmful content is posted at high volume. | Apply rate limits, detection and queue prioritisation without taking down unrelated users' content. | Not run | |
| MOD-09 | P0 | 2 | Moderator account is suspended while cases are assigned. | Reassign open cases and revoke moderation privileges. | Not run | |
| MOD-10 | P0 | 2 | Moderator exports report data containing sensitive information. | Restrict export to authorised roles and log export events. | Not run | |
| MOD-11 | P1 | 2 | Reported content is edited after report submission. | Preserve the reported snapshot/version where policy permits and show current state separately. | Not run | |

## 9. Events and Registrations

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| EVT-01 | P1 | 2 | User registers for the same event multiple times. | Allow only one active registration per user unless multiple tickets are explicitly supported. | Pass | server/test/events.test.js EVT-01 (3 simultaneous RSVPs → 1 row; change updates it) |
| EVT-02 | P1 | 2 | Event reaches capacity while two users register simultaneously. | Enforce capacity atomically; place overflow on waitlist or reject. | Pass | server/test/events.test.js EVT-02 (last seat, 2 at once → 1 going, 1 EVENT_FULL; row locked in a transaction). Overflow is rejected; a waitlist comes with Phase 2 registrations |
| EVT-03 | P1 | 2 | Event is cancelled or rescheduled after registrations. | Notify registrants and update calendar/reminder state; do not retain stale event details. | Pass | server/test/events.test.js EVT-03 (time/place change and cancel email going/maybe registrants; RSVP and edit refused after cancel). In-app notifications and reminder state follow in Phase 2 |
| EVT-04 | P1 | 2 | Event time crosses daylight-saving or user timezone boundaries. | Display local time correctly and store a consistent canonical timestamp/timezone. | Pass | server/test/events.test.js EVT-04 (stored as an instant + organiser zone; weekly London 18:00 stays 18:00 across the Oct DST change; monthly 31st skips short months). shared/recurrence.js is used by server and web app |
| EVT-05 | P1 | 2 | Member is removed from the community before a members-only event. | Recheck access and apply the defined registration/attendance policy. | Pass | server/test/events.test.js EVT-05 (removed member: event not found, RSVP refused, RSVP stops counting and frees the seat) |
| EVT-06 | P1 | 2 | Event creator leaves, is suspended or deleted. | Transfer event management or assign an authorised replacement. | Pass | server/test/events.test.js EVT-06 (host suspended → community admin edits and cancels). A deleted host shows as “Deleted member” and the event stays with community admins; explicit host transfer is Phase 2 |
| EVT-07 | P1 | 2 | Registration deadline passes while a form is open. | Revalidate deadline at submission; reject late registration clearly. | Pass | server/test/events.test.js EVT-07 (deadline passes with the form open → RSVP_CLOSED on submit; “not going” still allowed) |
| EVT-08 | P0 | 2 | Private event URL is shared with a non-member. | Enforce event visibility and eligibility on every request. | Pass | server/test/events.test.js EVT-08 (invite-only: non-invitees get 404 on detail, RSVP, comments and lists; removed invitee loses access and RSVP) + VIS-02/03 events + server/test/public.test.js EVT-08 (public listing: only open, scheduled, upcoming events of Public communities) |
| EVT-09 | P1 | 2 | Waitlisted user is promoted after capacity changes but has already cancelled. | Do not reactivate a cancelled registration; promote the next eligible user. | Pass | stage4 waitlist: someone who left the waitlist isn’t put back; the next in line gets the place and is notified |
| EVT-10 | P2 | 2 | Attendance is marked more than once or changed after event closure. | Prevent duplicate attendance records and audit corrections. | Not run | |

## 10. LMS Courses, Lessons and Enrolment

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| LMS-01 | P0 | 2 | Course is deleted while learners are enrolled or progressing. | Block immediate deletion or require an impact review, learner notice and retention decision. | Not run | |
| LMS-02 | P1 | 3 | Instructor leaves, is removed or suspended while course is active. | Reassign instructor or pause affected management actions; learners retain valid access as policy allows. | Not run | |
| LMS-03 | P1 | 2 | Course is unpublished after learners enrol. | Apply a clear policy for existing learners; do not silently erase access/progress. | Not run | |
| LMS-04 | P1 | 3 | Course content is updated after a learner has completed it. | Preserve completion/version history and define whether re-completion is required. | Not run | |
| LMS-05 | P2 | 2 | Learner repeats a lesson or marks it complete multiple times. | Keep progress and completion records consistent; avoid inflated counts. | Not run | |
| LMS-06 | P0 | 2 | User submits multiple enrolment requests or clicks Enrol repeatedly. | Create one enrolment and return the existing state on retry. | Not run | |
| LMS-07 | P1 | 3 | Course capacity is reached during simultaneous enrolment. | Enforce capacity atomically and apply waitlist/closed behaviour. | Not run | |
| LMS-08 | P0 | 2 | Guest tries to access a members-only lesson using a direct URL. | Deny access server-side even if the lesson URL is known. | Not run | |
| LMS-09 | P1 | 3 | Member is removed from the community while enrolled in a members-only course. | Apply the configured continuation/revocation policy and communicate the impact. | Not run | |
| LMS-10 | P1 | 2 | Video, PDF or external learning resource fails to load. | Show a useful error/retry path and do not mark the lesson complete automatically. | Not run | |
| LMS-11 | P1 | 2 | Learner loses network connection while watching/reading or submitting progress. | Save progress safely where possible and reconcile without duplicate or false completion. | Not run | |
| LMS-12 | P1 | 2 | Learner opens a lesson in multiple tabs/devices. | Synchronise progress without overwriting newer progress or double-counting completion. | Not run | |
| LMS-13 | P0 | 2 | Course is moved to another community or ownership changes. | Re-evaluate enrolment, visibility, instructor authority and resource permissions. | Not run | |
| LMS-14 | P0 | 2 | Instructor tries to manage a course in a community where they are not assigned. | Deny the action; instructor scope must be community/course-specific. | Not run | |
| LMS-15 | P1 | 2 | Course has no lessons or a required module is missing. | Prevent publication or clearly mark the course as incomplete according to publishing rules. | Not run | |

## 11. LMS Assessments, Grading and Certificates

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| ASM-01 | P0 | 3 | Learner submits a quiz twice due to a slow response. | Accept one submission or preserve attempts according to configured attempt limits. | Not run | |
| ASM-02 | P0 | 3 | Network disconnects during an assessment. | Preserve saved answers where possible and apply a documented resume/attempt policy. | Not run | |
| ASM-03 | P0 | 3 | Learner submits after deadline due to timezone mismatch or client clock manipulation. | Use server-side deadline and configured grace-period rules. | Not run | |
| ASM-04 | P1 | 3 | Quiz questions/options change after learner starts an attempt. | Lock the attempt to a version or apply a controlled update policy. | Not run | |
| ASM-05 | P1 | 3 | Instructor changes the grading rubric after submissions. | Retain rubric version and prevent unexplained retroactive score changes. | Not run | |
| ASM-06 | P1 | 3 | Two instructors grade the same submission simultaneously. | Prevent conflicting final grades or require a defined moderation/second-marker process. | Not run | |
| ASM-07 | P0 | 3 | Instructor grades a submission belonging to an unassigned course. | Deny access and grading action. | Not run | |
| ASM-08 | P1 | 3 | Learner is removed from course/community before assessment deadline. | Apply enrolment status policy; preserve submitted work and communicate remaining access. | Not run | |
| ASM-09 | P0 | 3 | Certificate is issued despite unmet completion criteria. | Validate eligibility server-side before issuance. | Not run | |
| ASM-10 | P1 | 3 | Certificate is revoked, reissued or learner name changes. | Maintain verifiable issuance history and ensure old certificate status is clear. | Not run | |
| ASM-11 | P1 | 3 | Course is deleted after certificates have been issued. | Preserve certificate verification/history according to retention policy. | Not run | |
| ASM-12 | P0 | 3 | Learner attempts to access another learner's submission or grade. | Deny access unless explicit peer-review permissions allow limited access. | Not run | |
| ASM-13 | P1 | 3 | Question bank contains malformed or missing answers. | Prevent publishing/assessment start or flag the invalid question to the instructor. | Not run | |
| ASM-14 | P0 | 3 | Assessment attempt limit is reached across multiple devices. | Enforce attempt limits centrally, not per browser/device. | Not run | |

## 12. Resources and File Management

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| FIL-01 | P0 | 2 | User uploads unsupported extension, spoofed MIME type or executable file. | Validate actual file type, quarantine unsafe files and block prohibited formats. | Pass | server/test/stage4.test.js FIL-01: type from the bytes; renamed executable, SVG, non-Office ZIP and binary .txt refused; a PDF named .png stored as PDF; downloads are attachments with nosniff and a sandbox CSP |
| FIL-02 | P1 | 2 | File exceeds configured size or storage quota. | Reject before/after upload safely and explain the applicable limit. | Pass | stage4 FIL-02: over 10 MB → 413 “Files can be up to 10 MB”; empty refused; the client checks size before uploading |
| FIL-03 | P1 | 2 | Upload is interrupted or retried. | Resume safely if supported; otherwise discard incomplete object and avoid duplicate resources. | Pass | stage4 FIL-03: one insert per upload, so an interrupted upload stores nothing; a retry with the same Idempotency-Key returns the same file |
| FIL-04 | P0 | 2 | Malware scanning service is unavailable. | Keep file quarantined/unavailable until scan succeeds; do not expose unscanned files. | Gap (accepted) | Decision S4-6 (11 Nov 2026): no malware scanner. Mitigation: safe-type allow-list from the bytes, download-only serving. Stays open until a scanner is added |
| FIL-05 | P0 | 2 | Private resource URL is shared outside the community. | Require authenticated, authorised access and expiring links. | Pass | stage4 FIL-05: every download re-runs the community access check; outsiders and people who left get 404; outsiders can’t upload |
| FIL-06 | P1 | 2 | Resource owner is removed or deleted. | Preserve community-owned resources and transfer management; do not orphan them. | Pass | stage4 FIL-06: resources belong to the community; a deleted author shows as “Former member” and the file still downloads |
| FIL-07 | P2 | 2 | Resource is deleted while users are downloading it. | Handle in-flight downloads consistently and invalidate future access as policy requires. | Pass | stage4 FIL-07: deleting a resource stops its file at once; the bytes are read in the same step that re-checks deletion |
| FIL-08 | P1 | 2 | Two users upload resources with the same filename. | Use unique identifiers and display names safely; never overwrite another user's file accidentally. | Pass | stage4 FIL-08: files are stored under generated ids; equal names are separate files |
| FIL-09 | P1 | 2 | File is replaced while a learner or member has it open. | Version or invalidate the resource predictably and avoid serving mismatched content. | Pass | stage4 FIL-09: replacing keeps the resource id and link, bumps the version, and the old file stops downloading; stale edits are refused |
| FIL-10 | P1 | 2 | Global file size/type policy changes while upload is in progress. | Revalidate at completion and reject non-compliant uploads safely. | Pass (by design) | Size and type are checked after the whole file has arrived, against the limits in lib/files.js; no policy setting changes mid-upload yet |

## 13. Notifications, Email and In-app Alerts

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| NTF-01 | P1 | 2 | User disables a notification category but receives it anyway. | Respect preference and channel settings, except for explicitly defined essential security notices. | Pass | stage4 NTF-06/NTF-01: turning off a category’s email stops the email; the notification still appears in the app |
| NTF-02 | P2 | 2 | One event generates duplicate notifications through retries or multiple workers. | Deduplicate using event/recipient identifiers. | Pass | stage4: a retried reply notifies once (unique recipient + dedupe key) |
| NTF-03 | P1 | 2 | Email provider is unavailable or rejects delivery. | Retry with limits, record failure and retain in-app notification where applicable. | Pass | stage4 jobs: failed emails retried each minute up to 3 attempts within a day, then left recorded in email_outbox; the in-app notification stays |
| NTF-04 | P0 | 2 | User is removed from a community before a scheduled reminder is sent. | Recheck recipient eligibility at send time. | Pass | stage4 jobs: reminders are checked when due — only people still going and still members get one, once per occurrence and reminder time |
| NTF-05 | P1 | 2 | Invitation expires before notification is opened. | Show expired state and do not allow acceptance. | Not run | |
| NTF-06 | P0 | 2 | Private post text appears in push/email preview for a non-member. | Use privacy-safe generic previews or omit protected content. | Pass | stage4: notification emails name who and where, never the post text |
| NTF-07 | P1 | 2 | User changes email while a message is queued. | Send only to the currently verified destination according to policy. | Pass (by design) | The address is read from the account when the email is sent |
| NTF-08 | P1 | 2 | Admin email alert for a deletion request fails. | Keep request in internal queue and surface delivery failure for retry. | Not run | |
| NTF-09 | P1 | 2 | User receives a notification after account suspension/deletion. | Suppress non-essential messages and follow account lifecycle/privacy policy. | Pass | stage4 NTF-09: suspended accounts and blocked pairs get nothing |
| NTF-10 | P0 | 2 | Notification links to content whose visibility has changed. | Recheck permissions on click; never assume notification possession grants access. | Pass | stage4 NTF-10: after losing access a notification reads “This is no longer available to you”, with no link, name or content; Saved items do the same |

## 14. Search, Explore and Recommendations

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-01 | P0 | 2 | Closed community name appears in public search suggestions/autocomplete. | Do not return closed community names or metadata to unauthorised users. | Pass | server/test/public.test.js VIS-04 (public discovery search never returns Closed names or their categories). + core.test.js SRC-01 (signed-in search: Closed communities only for their members) |
| SRC-02 | P0 | 2 | Private post content appears in search results for non-members. | Filter search results by current access permissions. | Pass | server/test/core.test.js SRC-02 (posts and events from Private/Closed communities only for members; drafts and deleted posts never) |
| SRC-03 | P1 | 2 | Community is renamed but old search result links remain. | Redirect only to the new permitted page; recheck visibility and access. | Not run | |
| SRC-04 | P1 | 2 | Archived/suspended community remains in recommendations. | Remove or clearly label it according to platform policy. | Pass | server/test/public.test.js VIS-04 (archived and suspended excluded from public discovery) + communities.test.js DEL-01 |
| SRC-05 | P0 | 2 | User's access changes between search and result click. | Recheck permission on destination; do not rely on search-time authorisation. | Pass | server/test/core.test.js SRC-05 (post page refuses once membership is removed; search stops listing it) |
| SRC-06 | P2 | 2 | Search returns no results or service is unavailable. | Show useful empty/error state and preserve query for retry. | Pass | server/test/core.test.js SRC-06 (short, invalid, wildcard queries) + browser: empty state; query kept in the address for retry. Error state seen in the browser 11 Nov (search requests made to fail): message shown, Try again recovered |
| SRC-07 | P2 | 2 | Multiple communities have similar names or duplicate descriptions. | Show distinguishing metadata without exposing private details. | Not run | |
| SRC-08 | P0 | 2 | Recommendation engine uses closed/private activity outside authorised scope. | Respect visibility, consent and data access rules in recommendation inputs and outputs. | Not run | |

## 15. Analytics, Reporting and Exports

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| ANL-01 | P1 | 4 | Community has zero members or no activity in selected period. | Show zero/empty states; avoid divide-by-zero or misleading percentages. | Not run | |
| ANL-02 | P1 | 4 | One person belongs to several communities and platform unique users are calculated. | Count unique platform users once; distinguish memberships from unique people. | Not run | |
| ANL-03 | P1 | 4 | Account is deleted but historical activity remains in aggregate reports. | Apply anonymisation/retention rules and keep metrics internally consistent. | Not run | |
| ANL-04 | P1 | 4 | Date range crosses timezone/daylight-saving boundaries. | Use defined reporting timezone and inclusive/exclusive boundaries consistently. | Not run | |
| ANL-05 | P2 | 4 | Analytics data is delayed or partially processed. | Display last-updated time and avoid presenting partial figures as final. | Not run | |
| ANL-06 | P0 | 4 | Moderator attempts to view revenue or unrelated platform analytics. | Deny unless separately authorised. | Not run | |
| ANL-07 | P0 | 4 | Unauthorised user exports member-level or learner-level data. | Deny export and audit access attempts. | Not run | |
| ANL-08 | P0 | 4 | Small-group report could identify an individual. | Suppress, aggregate or restrict the result according to privacy threshold. | Not run | |
| ANL-09 | P0 | 4 | CSV export formula cells contain user-controlled text. | Escape formula-leading characters and prevent spreadsheet formula injection. | Not run | |
| ANL-10 | P2 | 4 | Analytics filter is changed while export is being generated. | Bind export to a fixed filter snapshot and show the applied date range. | Not run | |
| ANL-11 | P2 | 4 | Metrics definitions change between reporting periods. | Version definitions or annotate changes to avoid misleading comparisons. | Not run | |

## 16. Community and Platform Settings

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| SET-01 | P0 | 2 | Community Admin tries to change a setting controlled globally. | Reject the change and explain that the setting is managed at platform level. | Not run | |
| SET-02 | P0 | 2 | Platform Admin disables a feature while a community is actively using it. | Apply documented graceful shutdown/migration behaviour; prevent new use without corrupting existing data. | Not run | |
| SET-03 | P1 | 2 | Two admins save conflicting settings simultaneously. | Detect conflict or apply version checks; do not silently overwrite changes. | Pass | server/test/admin.test.js SET-03; server/test/communities.test.js community settings version check |
| SET-04 | P2 | 2 | Admin changes community category while it is featured or recommended. | Update discovery metadata and dependent placements consistently. | Not run | |
| SET-05 | P1 | 2 | File upload limits are reduced below existing stored file sizes. | Do not delete existing files unexpectedly; apply new limits to future uploads and document migration rules. | Not run | |
| SET-06 | P1 | 2 | Default platform language/timezone changes after communities have configured their own values. | Preserve explicit community/user overrides; apply new defaults only where intended. | Not run | |
| SET-07 | P0 | 2 | Settings save partially succeeds across multiple services. | Use transactional behaviour or rollback/clear partial state and communicate result. | Not run | |
| SET-08 | P0 | 2 | User manipulates hidden settings API fields not shown in UI. | Validate permissions and allowed fields server-side; reject mass assignment. | Pass | server/test/admin.test.js SET-08 field allow-list |
| SET-09 | P2 | 2 | Admin leaves settings page with unsaved changes. | Warn about unsaved changes and avoid accidental data loss. | Not run | |
| SET-10 | P0 | 2 | Platform-wide security setting is changed by an unauthorised staff role. | Deny and record the attempt. | Pass | server/test/admin.test.js SET-10/PER-07 |

## 17. Community Archive, Transfer and Deletion

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| DEL-01 | P0 | 2 | Community Admin looks for a direct permanent-delete action. | Show Request Community Deletion only; no direct delete control/API permission. | Pass | server/test/communities.test.js DEL-01 / TC-03; browser 10 Nov: Delete only for platform staff, Archive for admins |
| DEL-02 | P1 | 2 | Admin submits the same deletion request repeatedly. | Deduplicate or link requests; do not create conflicting active requests. | Not run | |
| DEL-03 | P1 | 2 | Email to Platform Admin fails after request submission. | Keep the request in the in-platform queue and flag failed delivery. | Not run | |
| DEL-04 | P1 | 2 | Platform Admin rejects a request without a reason. | Require a reason and notify the requester. | Not run | |
| DEL-05 | P2 | 2 | Requester wants to cancel while request is under review. | Allow cancellation only in permitted statuses and record it. | Not run | |
| DEL-06 | P1 | 2 | New members, posts or courses are created during deletion review. | Freeze selected operations or include new changes in the review; define the policy explicitly. | Not run | |
| DEL-07 | P0 | 2 | Community has active courses, learners, certificates or upcoming events. | Require impact review, learner/member communication and continuity decisions before deletion. | Not run | |
| DEL-08 | P0 | 2 | Community has outstanding payments, refunds or financial records. | Resolve financial obligations and retain legally required records before deletion. | Not run | |
| DEL-09 | P0 | 2 | Community has open reports or investigations. | Preserve evidence and resolve/transfer cases before permanent deletion. | Not run | |
| DEL-10 | P0 | 2 | Platform Admin selects the wrong community for deletion. | Show unmistakable identity details and require explicit confirmation/reauthentication. | Not run | |
| DEL-11 | P1 | 2 | Community is archived while deletion is pending. | Define member access, exports, restoration and notification behaviour. | Not run | |
| DEL-12 | P1 | 2 | Deleted community URL is accessed later. | Show a safe unavailable/removed state without leaking retained data. | Not run | |
| DEL-13 | P0 | 2 | Deletion process fails midway across services/storage. | Use recoverable jobs, retries and status tracking; do not report complete deletion prematurely. | Not run | |
| DEL-14 | P0 | 2 | Community is restored from backup after deletion. | Ensure restored state respects deletion requests, retention and audit/legal policy. | Not run | |
| DEL-15 | P1 | 2 | Owner requests deletion but Platform Admin has already transferred ownership. | Revalidate requester authority and current community state before acting. | Not run | |

## 18. Integrations, APIs and External Services

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| INT-01 | P1 | 4 | Email, video, storage, payment or analytics provider is unavailable. | Show degraded state, retry safely and preserve platform data; do not mark failed work complete. | Not run | |
| INT-02 | P0 | 4 | Webhook is delivered more than once or out of order. | Use idempotency/event identifiers and tolerate ordering differences. | Not run | |
| INT-03 | P0 | 4 | Webhook signature is invalid or timestamp is stale. | Reject request and log security event. | Not run | |
| INT-04 | P0 | 4 | API key is revoked while an integration is using it. | Reject subsequent calls and provide controlled credential rotation. | Not run | |
| INT-05 | P1 | 4 | External service returns malformed or unexpected data. | Validate response schema and fail safely without corrupting records. | Not run | |
| INT-06 | P0 | 4 | Payment succeeds externally but callback is delayed/lost. | Reconcile payment state through verified provider records; avoid duplicate charge or entitlement. | Not run | |
| INT-07 | P2 | 4 | External video/resource URL changes or becomes unavailable. | Show unavailable state and allow authorised replacement; do not silently mark content complete. | Not run | |
| INT-08 | P0 | 4 | Integration attempts to access data outside its granted scope. | Enforce scoped permissions and log denied access. | Not run | |

## 19. Performance, Availability and Data Integrity

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| SYS-01 | P1 | 4 | Large community feed or member list is loaded without pagination. | Use pagination/limits and prevent memory/performance degradation. | Pass | server/test/profiles.test.js pagination with total; browser 10 Nov: directory shows 24 of 35 + Show more |
| SYS-02 | P1 | 4 | High-volume posting or notification activity occurs suddenly. | Apply rate limits, queues and back-pressure without losing accepted records. | Not run | |
| SYS-03 | P0 | 1 | Database/service is unavailable during a write. | Do not show success unless committed; allow safe retry and preserve consistency. | Not run | |
| SYS-04 | P0 | 1 | Background job runs twice after retry or worker restart. | Make jobs idempotent and prevent duplicate emails, certificates or deletion actions. | Pass | server/test/communities.test.js SYS-04 scheduled publish |
| SYS-05 | P0 | 1 | Cache contains stale membership or permission data. | Invalidate or recheck critical permissions before serving protected data/actions. | Not run | |
| SYS-06 | P0 | 4 | Backup restore produces mismatched users, memberships or files. | Run integrity checks and reconcile references before reopening the platform. | Not run | |
| SYS-07 | P1 | 4 | Maintenance begins during a quiz, upload or deletion workflow. | Preserve state or communicate interruption and recovery rules; do not corrupt partial work. | Not run | |
| SYS-08 | P0 | 1 | System clock differs across application services. | Use trusted time synchronisation and server-side timestamps for deadlines/audit. | Not run | |
| SYS-09 | P0 | 1 | Concurrent requests update the same counters or membership records. | Use atomic updates/transactions so counts and state remain accurate. | Not run | |
| SYS-10 | P1 | 1 | A user submits an action after session timeout. | Reject safely, preserve draft where possible and require reauthentication. | Not run | |

## 20. Accessibility, Responsive UI and Usability

| ID | Pri | Phase | Scenario | Expected behaviour | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| UX-01 | P1 | All | User relies on keyboard navigation only. | All core controls, dialogs, menus and forms must be keyboard accessible with visible focus. | Not run | |
| UX-02 | P1 | All | Screen reader encounters icon-only buttons or status indicators. | Provide accessible names, labels and announced state changes. | Not run | |
| UX-03 | P2 | All | User has low bandwidth or images fail to load. | Provide loading/error states, sensible fallbacks and avoid blocking core navigation. | Not run | |
| UX-04 | P1 | All | Layout is used on small mobile screens or at high zoom. | Prevent clipped controls, horizontal overflow and inaccessible actions. | Not run | |
| UX-05 | P1 | All | Important action is available only on hover. | Provide touch and keyboard alternatives. | Not run | |
| UX-06 | P2 | All | User submits a form with errors across multiple steps. | Preserve valid entries, identify each error and return focus to the relevant field. | Not run | |
| UX-07 | P0 | All | Destructive action confirmation is vague or does not identify target. | State the exact community/content/action and consequence before confirmation. | Not run | |
| UX-08 | P2 | All | Loading state persists after a failed request. | Resolve to a clear error/retry state and avoid leaving controls permanently disabled. | Not run | |
