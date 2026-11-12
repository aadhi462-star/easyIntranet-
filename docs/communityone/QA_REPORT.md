# CommunityOne: final QA report (v2 workstream H, 12 Nov 2026)

Workstream H is the final pass of the v2 brief. It covers responsive layout on every screen, a WCAG 2.2 AA audit, a permissions and security review, and this report. Results below are measured; anything not checked is listed as not checked.

## Summary

| Area | Result |
| --- | --- |
| Server tests (`npm run test:server`) | 442 of 442 pass (433 before H, plus 9 new security tests) |
| Browser journeys (`npm run test:e2e`) | Before H: 23 pass, 1 skipped. After H: 22 pass and 1 fails per full run, a different journey each time (`/` search focus, then create-from-template). Each passes when run on its own. The machine was heavily loaded (5.9 min against 59 s at baseline), so these look like timing failures, but that isn't proven. |
| Screen audit (`npm run test:audit`) | **0 findings** on the final run: 161 (11 signed out, 27 member, 65 host, 58 Super Admin) screens, each at 375, 768 and 1280 px, plus dark mode at 1280 px |
| Sideways scroll (WCAG 1.4.10) | None, on any screen, at any width |
| Controls without a name (4.1.2) | None (read from Chrome's accessibility tree) |
| Security review | 10 findings confirmed: 1 high, 3 medium, 6 low. Fixed: 1–6, 8, 10 and part of 7. Open: 9 and the rest of 7 (decisions below) |

## 1. How the screens were checked

`e2e/audit.spec.js` (run with `npm run test:audit`) signs in as four roles and follows every in-app link it finds. The roles are: signed out, a member (Ishita), a community host (Neha) and the Super Admin (Sara). It checks one screen of each address shape, so it covers every kind of screen once, for example `/c/:slug/manage/settings/:section`. It doesn't open all 34 communities. On each screen it checks:

- **Reflow (1.4.10):** the page never scrolls sideways at 375, 768 or 1280 px.
- **Target size (2.5.8 AA):** every control is at least 24 × 24 px. Links inside running text are exempt.
- **Contrast (1.4.3):** every visible piece of text is checked against its real background, in light mode and again in dark mode. Large text needs 3:1, other text needs 4.5:1.
- **Names (4.1.2):** every button, link, field, tab, switch and image has an accessible name, read from Chrome's own accessibility tree.
- **Structure (1.3.1, 2.4.6, 3.1.1):** each page has a `lang`, a `<main>` and one h1, heading levels don't skip, images have `alt`, `aria-labelledby`/`for` references resolve, and ids are unique.
- **Focus visible (2.4.7):** at desktop width, the first 25 Tab stops each show an outline or ring.

Findings are written to `test-results/audit/<role>.json`, grouped by element. `AUDIT_STRICT=1` turns any finding into a failure.

## 2. Accessibility and responsive: what was found and fixed

The first audit run found these problems. After the fixes, the final run found none.

| Rule | First run | Cause | Fix |
| --- | --- | --- | --- |
| Contrast 1.4.3 | 4 patterns, on ~130 elements | Accent text `#127A61` on the 14% accent tint measures 4.34:1. This covers interest and status chips, the selected composer type, and pressed reactions. | New token `--az-on-tint`: `#0F6B55` in light mode (5.3:1), unchanged in dark mode. Used by `.chip`, `Composer` and `PostCard`. |
| Target size 2.5.8 | 16 patterns | Text links and buttons 16–23 px tall: `.link`, author and community names, post timestamps, event titles, a radio label. | `.link` and the new `.hit` class are inline-block, with vertical padding of `(24px − 1lh) / 2`. That brings a one-line link to 24 px without moving its text. The timestamp has `min-w-6`, and the announcement radio label has `min-h-6`. |
| Headings 1.3.1 | 7 | h1 followed by h3 on community Members, Events, Manage and the signed-out Explore. No h1 on a single post, or in Administration on phones and tablets. | Section headings are now h2 (same look). `CommunityCard` takes a `level`. Screen-reader-only headings were added on the post page, the community Events list and the phone Administration view. |
| Unique ids 4.1.1 | 1 | "Next event" on the community Overview renders twice (phone and desktop placement), so `next-h` appeared twice. | `useId()`. |
| Focus visible 2.4.7 | 2 | Date fields. Their last Tab stop is Chrome's own calendar button inside the field, which draws its own ring. | No change: this is how the browser works, and it was confirmed in a minimal page. The check now skips date and time fields. |

Not found on any screen at any width: sideways scroll, controls without a name, images without `alt`, broken label references, a missing `lang` or `<main>`.

Already in place and confirmed in code: a "Skip to content" link, `prefers-reduced-motion` turns off transitions and animations, and dialogs keep focus inside, close on Escape and return focus to the control that opened them.

## 3. Permissions and security review

A separate reviewer read every route file. Each finding below was confirmed against the running app, and each fix has a test in `server/test/h-security.test.js`.

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| H-S1 | High | A Moderator could use `POST /communities/:id/members/:userId` to make someone who had left an active member again, approve a join request, or block and remove people without a sanction record. That broke "nobody joins without choosing". | The route now changes only current (active or restricted) members. Removing and blocking need an Admin, as they do on `/sanction`. Undoing a removal goes through `/lift`. |
| H-S2 | Medium | `trustProxy: true` let a client set its own IP with `X-Forwarded-For`, which got around every rate limit, including password guessing on `/auth/reactivate`. | The server trusts one proxy hop (`TRUST_PROXY_HOPS`, default 1). |
| H-S3 | Medium | Trust & Safety and User Manager staff could suspend Platform Admins and sign them out. | Staff can only suspend, or sign out, people whose platform roles they could assign themselves. |
| H-S4 | Medium/low | People who turned off "List me in member directories" still appeared in Members tabs, although the setting says they won't. Blocked pairs appeared too. | Both are left out for members. Moderators keep the full list. One older test that expected them to be listed was updated. |
| H-S5 | Low | `GET /connections/:id` told you when someone had blocked you. | It answers 404, the same as the profile. |
| H-S6 | Low | A suspended community could still be edited by its own staff (settings, roles, ownership transfer). | Those routes answer 409 `SUSPENDED` unless Administrative Mode is on. |
| H-S7 | Low | Reactivation didn't count wrong passwords toward the lockout, and it answered faster for unknown emails. | It now uses the sign-in lockout and does the same work for every email. **Open:** see the decisions below. |
| H-S8 | Low | An old link to a merged community gave away the address of its new home, even when that was Closed. | The address is given only to people who could open the new home. |
| H-S9 | Low | `/files/:id` checks only that you can view the community, not what the file is attached to (a draft post, another learner's assignment). File ids are random 72-bit values and no route shows them to other members. | **Not fixed.** Recorded as a known gap. The fix is to check the file's owner object. |
| H-S10 | Low | `/admin/confirm-password` had no rate limit. | 5 a minute. |

**Reviewed and found clean:** sessions and CSRF, `/api/dev/*` (off in production), Administrative Mode, status filters (merged, deleted and suspended communities), draft and hidden courses, reporters never named, invitations, SQL, file uploads and downloads, and platform permissions. The details are in the progress log.

## 4. Decisions for you

1. **Account enumeration (rest of H-S7).** Create account says "That email is already registered", and a locked account says so before the password is checked. Both tell an outsider that an account exists. The private alternative is to always say "Check your email" and send the owner a "someone tried to sign up" email. That makes sign-up a little less clear. **Recommendation:** keep it for the pilot and decide before real members join.
2. **H-S9 file checks.** Fix now (about 1 hour) or keep as a known gap until there are real members?
3. **Proxy hops on AppSail (H-S2).** One hop is the usual AppSail setup, but it hasn't been confirmed on the live service. After the next upload, check that Administration → Activity shows real visitor IPs, not one shared address. If it shows a shared address, set `TRUST_PROXY_HOPS=2`. Otherwise everyone shares one sign-in limit.

## 5. Not checked

- A real screen reader (VoiceOver or NVDA). The accessibility tree was checked, but not a spoken walkthrough.
- Zoom to 200% and text spacing (1.4.4, 1.4.12) were not run separately. The 375 px pass covers most reflow at 400%.
- A Community Moderator role. The crawl used member, host (Owner and Admin) and Super Admin.
- The 24 px rule was checked by element size only. The "spacing" exception in 2.5.8 wasn't used, so a few targets were made bigger than strictly needed.
- Screens behind actions, such as an open dialog, a multi-step wizard after step 1, or a quiz in progress. The crawler follows links. It doesn't fill in forms.
- The parked modules (off by default) and the browser-only admin tools behind `admin.legacy`.
- Live AppSail behaviour. No new bundle was built; the bundle on record is from after workstream D.
