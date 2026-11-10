# AlumniZone

An open alumni community app — feeds, groups and spaces, events, town halls, forums, ideas,
channels, tasks and boards, files, manuals, people directory, recognition and an admin
console — built with React, Vite and Tailwind CSS. Everything is free to use; there are no
paid tiers or external integrations.

All data is demo data kept in the browser (localStorage). People, places and organisations
in it are fictional.

## Run it

CommunityOne is moving from a browser-only prototype to a server-backed app (see
`docs/communityone/PHASE0_ASSESSMENT.md`). Accounts and sessions already run on the server.

```bash
npm install
npm run db:seed        # creates the local database and demo accounts (safe to re-run)
npm run build          # builds the web app into dist/
npm run server         # API + web app on http://localhost:5181
```

The server uses PostgreSQL. Locally that's PGlite (the PostgreSQL engine as an npm package),
stored in `server/.data/pg`; set `DATABASE_URL` to use a PostgreSQL server instead.

```bash
npm run test:server    # server tests (in-memory database)
```

`.npmrc` sets `ignore-scripts=true` because `@ybouane/liquidglass` ships a postinstall
step that isn't needed here.

## Demo accounts

See [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md). These are demo values for local testing only.

## Project layout

- `src/pages/` — one file per module, loaded lazily
- `src/data/seed.js`, `src/data/modules/` — demo data
- `src/lib/store.jsx` — app state (single reducer, saved to localStorage)
- `src/lib/runners/` — background behaviour (scheduled posts, reminders, workflows)
- `src/styles/index.css` — graphite and lime theme, light and dark mode
