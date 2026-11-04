# WhereIWalk — Plan

A web app that imports your walks/runs/rides, shows them on a map of the UK,
overlays National Trails and LDWA long-distance paths, and shows how much of
each trail you have completed.

- **Audience:** friends and family (invite-only). Not expected to grow beyond that.
  Free to use; no plans to charge.
- **Activity source:** Strava.
- **Trails:** National Trails + LDWA paths.
- **Budget:** free tiers only.
- **Hosting:** Vercel (Hobby) + Neon Postgres with PostGIS. (Changed from Cloudflare
  on 2026-11-03. Vercel Hobby is, I believe, for non-commercial use, which fits a free
  friends-and-family app **[verify against Vercel's current terms]**.)

> Status: Phase 1 built, 2026-11-03. Items marked **[verify]** are unconfirmed and should be
> checked against a primary source before relying on them.

---

## 1. Key constraints found during research

### Strava API (Agreement + Policy, effective 1 June 2026)
Sources: <https://www.strava.com/legal/api>, <https://www.strava.com/legal/api_policy>,
<https://developers.strava.com/docs/getting-started/>

- **Display only to the owner** (Policy §2.3, §5.4, §6.2): Strava data, *including derived
  data* (maps, % complete), may only be shown to the user it belongs to. No shared
  leaderboards or public progress pages built from API data.
- **7-day cache limit** (Policy §6.2): "You may not retain Strava Data in your cache for
  longer than seven (7) days." How this applies to long-term activity history is
  unclear — **[verify with Strava before storing API data long term]**.
- **Deletion:** delete all of a user's data within 30 days of deauthorisation (§7.4);
  reflect deleted activities within 48 hours (§6.3). Requires webhooks.
- **Capacity:** apps start single-player; can upgrade to **10 athletes** without review.
  For a friends-and-family app this may be enough.
- **Cost:** API access currently free, but "A Strava subscription is a prerequisite for
  creating an app" — the developer needs a paid Strava subscription.
- **Other:** no AI/ML use of Strava data; can't charge users for API access; can't
  replicate Strava functionality or imitate its branding.

**Design consequence:** the primary import path is the user's own **Strava bulk export**
(Settings → My Account → Download your data) or GPX/FIT upload. These are files the user
gives us, not data obtained via the API **[verify this interpretation]**. Strava API sync
is an optional later add-on, owner-only, within the 10-athlete tier.

### LDWA path data
Sources: <https://www.ldwa.org.uk/>, <https://ldwa.org.uk/terms.php>

- LDWA lists 1,500+ UK paths. Route maps are members-only.
- Terms: "Commercial use, reproduction, modification of any material is strictly
  prohibited without prior approval by the LDWA."
- Whether GPX/geometry is available is unknown (path pages returned 403 to our fetch).
- **Action:** email LDP contact (Paul Nellist, ldp@ldwa.org.uk) asking for permission and
  whether route geometry exists.
- **Fallback:** OpenStreetMap hiking route relations (ODbL — attribution, share-alike on
  derived databases). Coverage of LDWA paths in OSM is **[unverified]**.

### National Trails data
- England: Natural England, Open Government Licence —
  <https://www.data.gov.uk/dataset/national-trails-england3>
- Wales: Natural Resources Wales, OGL —
  <https://metadata.naturalresources.wales/geonetwork/srv/api/records/NRW_DS99415>
- Scotland's Great Trails: source and licence **[to research]**.

---

## 2. Architecture (Vercel + Neon, free tiers)

| Layer | Choice | Notes |
|---|---|---|
| App | **Next.js 16** (App Router) on **Vercel** | Server pages + API route handlers |
| Map | **MapLibre GL JS** + **OpenFreeMap** vector tiles | No API key; OS Data Hub optional later |
| Database | **Neon Postgres + PostGIS** | Spatial matching in SQL; use Neon's pooled connection string |
| Auth | **Auth.js** (next-auth v5) with **Google** sign-in, JWT sessions | Admins in `ALLOWED_EMAILS`; invitees in the `invites` table (Invites page); per-person data |

### How matching works
1. **Trail loading (script, once per data update):** download National Trails GeoJSON,
   store each trail in EPSG:4326 (display) and EPSG:27700 British National Grid (metres),
   and cut it into ~100 m segments (`trail_segments`, GiST-indexed).
2. **Import (browser):** parse a Strava export ZIP / GPX / TCX / FIT locally, split tracks
   at GPS gaps > 500 m, drop tracks outside Great Britain, simplify (Douglas–Peucker, 5 m),
   and upload only the simplified track + name/type/date in batches of 20.
3. **Matching (PostGIS):** a segment is covered when ≥ 60% of it lies within 40 m of a
   track (`src/lib/coverage.ts`). One row per (segment, activity) in `segment_coverage`,
   so deleting an activity removes exactly its coverage. Re-importing is de-duplicated by
   a fingerprint (start time + distance).
4. **Display:** first/last 200 m of each track hidden on the map (privacy).

### Data model
- `users`, `trails`, `trail_segments(part, seq, start_m, length_m, geom, geom_bng)`
- `activities(fingerprint, name, activity_type, start_time, distance_m, geom, geom_bng)` —
  MultiLineString so GPS gaps are never bridged
- `segment_coverage(user_id, segment_id, activity_id, covered_on)`

## 3. Phases

### Phase 0 — Groundwork (no code)
- [ ] Email LDWA (ldp@ldwa.org.uk) re permission / data.
- [ ] Download National Trails data (England + Wales); research Scotland.
- [ ] Ask on the LDWA Facebook thread what people currently use (competitor check).
- [ ] Confirm Vercel Hobby and Neon free-tier limits/terms.
- [ ] Decide whether Strava API sync is worth it given the 7-day-cache question.

### Phase 1 — MVP (just you) — built 2026-11-03
- [x] Trail fetch/load scripts → 14 English National Trails, ~47k segments.
- [x] Map page: National Trails layer, walked sections, your tracks; per-trail % list.
- [x] Import: Strava bulk export ZIP + GPX/TCX/FIT (incl. .gz), processed in the browser.
- [x] Coverage matching + per-trail % complete, covered vs missing sections.
- [x] Per-trail page: distance done/remaining, gaps (with km ranges), contributing activities.
- [x] Activities page with delete.
- [x] Tests: parsing (GPX, FIT, Strava ZIP, CSV) + PostGIS matching integration tests.
- [ ] Deploy to Vercel + Neon (needs your accounts — see README).
- [ ] Try it with a real Strava export and tune the 40 m / 60% thresholds.
- [x] Wales-only National Trails (Glyndŵr's Way, Pembrokeshire Coast Path), Wales Coast
      Path, King Charles III England Coast Path (66 stretches); trail list grouped by type.
- [x] "How it works" page; step-by-step Strava export guide on the Import page.
- [x] Stats page and downloadable PDF brag sheet.
- [x] Member route uploads (private) with duplicate warning; admin sharing as Community routes.
- [ ] OpenStreetMap routes: code ready but disabled (ENABLE_OSM_ROUTES=1) — public Overpass
      servers refused or timed out from Vercel builds.

### Phase 2 — Friends & family
- [x] Invite-only Google login with per-person data (built 2026-11-03; replaced the
      shared username/password).
- [x] In-app Invites page for admins (invites table; admins in `ALLOWED_EMAILS`).
- [ ] Per-user data; optional share link for progress (upload-sourced data only).
- [ ] Add LDWA routes (if permitted) or OSM long-distance routes.
- [ ] Re-import / delete activity; delete account (all data).

### Phase 3 — Nice to have
- [ ] Optional Strava API sync for new activities (owner-only display, deauth/delete
      webhooks, within 10-athlete tier).
- [ ] Badges / milestones; "next gap to walk" planner; GPX export of missing sections.
- [ ] Scotland's Great Trails and other named routes.

---

## 4. Risks
1. **Strava terms** — owner-only display, 7-day cache wording. Mitigated by file import.
2. **LDWA permission** — may be refused; OSM fallback.
3. **Matching accuracy** — GPS drift, trail diversions, parallel paths. Needs a tunable
   threshold and a manual "mark section done / not done" override.
4. **Free-tier limits** — parse client-side; store only simplified tracks; Neon free
   storage and Vercel function duration limits **[verify current figures]**.
5. **Privacy** — tracks reveal home locations; trim start/end by default, private by default.

## 5. Open questions
- Which activity types count (walk/hike only, or runs and rides too)?
- Mobile-first or desktop-first?
