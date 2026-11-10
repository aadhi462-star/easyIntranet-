# Demo accounts (development only)

Accounts now live in the CommunityOne server database and **every account needs its password**.
The old "any password works" behaviour is gone. Load them with `npm run db:seed`.

These are development values. Never use them in a real deployment.

## Platform roles

| Name        | Email              | Role            | Password             |
| ----------- | ------------------ | --------------- | -------------------- |
| Sara Thomas | sara@example.com   | Super Admin + Platform Admin | Community-Demo-2026 |
| Aisha Raman | aisha@example.com  | Platform Admin  | Community-Demo-2026  |

## Community hosts (Platform Admin)

| Name        | Email                  | Password         |
| ----------- | ---------------------- | ---------------- |
| Neha Kapoor | neha.host@example.com  | Lime-Host-4821   |
| Arjun Nair  | arjun.host@example.com | Lime-Host-7356   |

## Member

| Name         | Email              | Password            |
| ------------ | ------------------ | ------------------- |
| Ishita Verma | ishita@example.com | Alumni-Member-2093  |

## Everyone else

All other seeded people (34 in total) use **Community-Demo-2026**.

## Emails in development

No real email is sent yet (decision D5). Verification and reset emails are printed in the
server console and listed at `/api/dev/outbox` (disabled when `NODE_ENV=production`).
