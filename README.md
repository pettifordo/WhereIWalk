# WhereIWalk

Your walks on a map of the UK, and how much of each National Trail you've done.

Import your Strava bulk export (or GPX / TCX / FIT files). WhereIWalk matches each
track against the official National Trail routes and shows, per trail, how much you've
walked, where the gaps are, and which activities covered it.

See [plan.md](plan.md) for the roadmap and the research behind the design.

## How it works

- **Trails** come from Natural England's *National Trails (England)* dataset (Open
  Government Licence). Each trail is cut into ~100 m segments in Postgres/PostGIS.
- **Import** happens in the browser: files are parsed and each track is simplified
  (5 m tolerance) before upload, so raw files never leave your device.
- **Matching** runs in PostGIS: a segment counts as walked when at least 60% of it lies
  within 40 m of one of your tracks (`src/lib/coverage.ts`).
- **Privacy**: the first and last 200 m of each track are hidden on the map.

Stack: Next.js 16 (App Router) · MapLibre GL + OpenFreeMap tiles · Postgres + PostGIS
(Neon) · hosted on Vercel.

## Local development

Requirements: Node 22+, Postgres 16 with PostGIS 3.

```bash
npm install
cp .env.example .env            # set DATABASE_URL
npm run db:migrate              # create tables (idempotent)
npm run trails:fetch            # download National Trails GeoJSON into data/
npm run trails:load             # load trails + build segments (~15 s)
npm run dev                     # http://localhost:3000
npm test                        # unit + database integration tests
```

If `APP_USERNAME`/`APP_PASSWORD` are empty, login is disabled in development.

## Deploying (Vercel + Neon, free tiers)

The Vercel project `whereiwalk` is linked to this repo, with a Neon database
attached through Vercel's Storage tab (which sets `DATABASE_URL`).

Every Vercel build runs `npm run db:setup` first (see `vercel.json`). It applies the
schema (including `CREATE EXTENSION postgis`) and, only if the database has no trails
yet, downloads and loads them. So a new database is set up by its first deploy, and
the database password never has to leave Vercel.

Also set, under Project → Settings → Environment Variables (type *Sensitive*):
`APP_USERNAME` and `APP_PASSWORD`. Without them the site answers 503
("Login is not configured") so it can't accidentally go public.

To refresh trail data later (e.g. after Natural England updates it), run
`npm run trails:fetch && npm run trails:load` with `DATABASE_URL` pointing at the
database. This re-cuts segments and recomputes everyone's coverage.

## Data and licences

- National Trails: © Natural England copyright. Contains Ordnance Survey data © Crown
  copyright and database right. Open Government Licence v3.0.
- Base map: © OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors.
