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

1. **Neon**: create a project. In the SQL editor run `CREATE EXTENSION postgis;`
   (the migration also does this). Copy the **pooled** connection string.
2. **Load data into Neon** from your machine:
   ```bash
   DATABASE_URL='<neon pooled url>' npm run db:migrate
   DATABASE_URL='<neon pooled url>' npm run trails:fetch
   DATABASE_URL='<neon pooled url>' npm run trails:load
   ```
3. **Vercel**: import the GitHub repo as a new project (framework: Next.js). Add
   environment variables `DATABASE_URL`, `APP_USERNAME`, `APP_PASSWORD`, then deploy.

In production the site refuses to serve (HTTP 503) unless `APP_USERNAME` and
`APP_PASSWORD` are set, so it can't accidentally go public.

## Data and licences

- National Trails: © Natural England copyright. Contains Ordnance Survey data © Crown
  copyright and database right. Open Government Licence v3.0.
- Base map: © OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors.
