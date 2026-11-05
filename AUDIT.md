# Audit — November 2026

A full code-and-behaviour audit across every module, with fixes verified in the browser.

## What was fixed (74 issues)

| Area | Fixed | Highlights |
| --- | --- | --- |
| Feed | 12 | Reposts no longer leak private-group posts; reposts go through moderation; mention and Mandatory Read notices fire on every publish path; Mandatory Read audience and report math; per-member bookmarks; attachment and length caps; duplicate poll options |
| Events, calendar, town halls, live | 13 | Monthly repeats no longer drift after short months; "repeat until" validation; group town halls restricted to the group; camera/mic released if you leave during the permission prompt; hide/restore keeps question status; attachments are real downloads |
| Groups, people, recognition | 15 | Leaving drops admin/moderator roles and linked channels; auto-membership no longer re-adds people who left or were removed; pending/deactivated users excluded; profile validation; last-admin protection; org chart cycle guard; leaderboard ties |
| Collaboration | 17 | Sheet/slide typing no longer loses characters; channels require membership; removing a board section keeps its tasks; circular "blocked by" refused; view-only boards for non-members; storage-full uploads report an error; folder delete keeps subfolders; admin-only forum categories enforced |
| Core, auth, admin | 17 | Signed-up and invited accounts store a salted password hash and require it; search respects every visibility rule; encrypted export works for large data; modals keep focus, trap Tab and lock scroll; invites expire and are single-use; external users get the restricted role; saves migrate instead of resetting; two open tabs stay in sync; unknown roles grant nothing |

Points can no longer be farmed by toggling likes, votes, RSVPs or group membership, and points stop disappearing as the activity log is trimmed.

## Verified in the browser

- All 50 routes load with no errors at desktop, tablet (768px) and phone (375px) widths, with no horizontal overflow.
- Sign-up rejects short passwords, stores only a hash, and sign-in refuses a wrong password.
- A member is blocked from Admin, can't open channels they're not in, and search no longer returns other people's messages.
- Leaving a group removes you from it and its channels; like/unlike ×4 earns 1 point.
- Posting, RSVP, toasts and the dashboard work end to end; modal focus, Tab trap, Esc and scroll lock work.

Checked by reading code and running the date maths outside the browser, not through the UI:
monthly/daily recurrence edge cases (Jan 31, multi-year daily series).

## Known limitations and external dependencies

1. **No backend.** All data lives in each browser (localStorage, files in IndexedDB). People on different devices don't see each other's activity, and password hashing happens in the browser, so it is not real account security. A server and database are required before real use.
2. **Original demo people accept any password.** Only accounts with a password set (the hosts, Ishita, and anyone who signs up) require one.
3. **Smart Assist** uses Chrome's built-in on-device AI when available and simple local fallbacks otherwise.
4. **Live meetings** show your own camera and screen; there is no real-time connection between participants without a media server.
5. **Storage limit.** Browsers cap localStorage at about 5 MB; the app now warns when it is full.
6. External invites are still allowed when the "external users" security setting is off.
7. The group Settings tab resets unsaved edits if the same group is changed elsewhere at the same time.
8. The document sanitizer doesn't strip `form action` / `xlink:href` (low risk without a backend).
