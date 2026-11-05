# AlumniZone

An open alumni community app — feeds, groups and spaces, events, town halls, forums, ideas,
channels, tasks and boards, files, manuals, people directory, recognition and an admin
console — built with React, Vite and Tailwind CSS. Everything is free to use; there are no
paid tiers or external integrations.

All data is demo data kept in the browser (localStorage). People, places and organisations
in it are fictional.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5180. To build for production:

```bash
npm run build
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
