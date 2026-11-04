# WhereIWalk

Your walks on a map of the UK, and how much of each National Trail you've done.

Import your Strava bulk export (or GPX / TCX / FIT files). WhereIWalk matches each
track against the official National Trail routes and shows, per trail, how much you've
walked, where the gaps are, and which activities covered it.

See [plan.md](plan.md) for the roadmap and the research behind the design.

## How it works

- **Trails** come from open government data (Open Government Licence): the 16 National
  Trails (Natural England and Natural Resources Wales), the Wales Coast Path (NRW) and
  the King Charles III England Coast Path (Natural England, in 66 stretches). Sources
  are defined in `src/lib/trail-sources.ts`. Each trail is cut into ~100 m segments in
  Postgres/PostGIS.
- **Import** happens in the browser: files are parsed and each track is simplified
  (5 m tolerance) before upload, so raw files never leave your device.
- **Matching** runs in PostGIS: a segment counts as walked when at least 60% of it lies
  within 40 m of one of your tracks (`src/lib/coverage.ts`).
- **Privacy**: the first and last 200 m of each track are hidden on the map.
- **Member routes**: anyone can upload a route GPX on *My routes* (private to them; warned
  if it duplicates a visible route). Admins share uploads as *Community routes* on the
  admin *Community routes* page (one by one or in bulk).
- **Stats & brag sheet**: `/stats` shows totals, records and charts; "Download brag sheet"
  builds a PDF (map, stats, progress, walks) in the browser.
- **Accounts**: sign in with Google (Auth.js). Admins (emails in `ALLOWED_EMAILS`) can
  invite people on the in-app **Invites** page; only admins and invited people can sign
  in, and each person sees only their own activities and progress.

Stack: Next.js 16 (App Router) · MapLibre GL + OpenFreeMap tiles · Postgres + PostGIS
(Neon) · hosted on Vercel.

## Local development

Requirements: Node 22+, Postgres 16 with PostGIS 3.

```bash
npm install
cp .env.example .env            # set DATABASE_URL
npm run db:migrate              # create tables (idempotent)
npm run db:setup                # download + load any trail sources not yet loaded (~1 min)
npm run dev                     # http://localhost:3000
npm test                        # unit + database integration tests
```

To sign in locally without Google, set `AUTH_DEV_LOGIN=1` (see `.env.example`); the
sign-in page then shows a test login for any `ALLOWED_EMAILS` address. It is always
disabled on Vercel.

## Deploying (Vercel + Neon, free tiers)

The Vercel project `whereiwalk` is linked to this repo, with a Neon database
attached through Vercel's Storage tab (which sets `DATABASE_URL`).

Every Vercel build runs `npm run db:setup` first (see `vercel.json`). It applies the
schema (including `CREATE EXTENSION postgis`) and downloads and loads any trail source
that is new or whose `version` in `src/lib/trail-sources.ts` has been bumped (tracked in
the `trail_source_loads` table). So a new database is set up by its first deploy, and
the database password never has to leave Vercel.

### Google sign-in setup

1. In [Google Cloud Console](https://console.cloud.google.com/) create (or pick) a
   project, then **APIs & Services → OAuth consent screen**: user type *External*,
   app name *WhereIWalk*, your email as support/developer contact. While the app is in
   *Testing* status, add each person's Google email under **Test users** (or publish it).
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type
   *Web application*. Authorised redirect URIs:
   - `https://whereiwalk.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (optional, local dev)
3. In Vercel → Project → Settings → Environment Variables (type *Sensitive*, Production):
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — from step 2
   - `AUTH_SECRET` — any long random string, e.g. `openssl rand -base64 32`
   - `ALLOWED_EMAILS` — the admins, e.g. `owen@gmail.com` (first = owner)
4. Redeploy. Admins then invite everyone else on the **Invites** page in the app (no
   redeploy needed). While the Google app is in *Testing*, invitees must also be added
   as Google test users, or publish the app. Removing an invite locks that person out
   on their next request; "Remove + delete walks" also deletes their data.

Preview deployments get different URLs, so Google sign-in only works on the
production URL unless you add those URLs to the OAuth client too.

To refresh trail data later (e.g. after a publisher updates it), bump that source's
`version` and deploy, or run `npm run trails:load -- <source-id>` with `DATABASE_URL`
pointing at the database. This re-cuts segments and recomputes everyone's coverage.

## Data and licences

- National Trails: © Natural England copyright. Contains Ordnance Survey data © Crown
  copyright and database right. Open Government Licence v3.0.
- Base map: © OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors.
