# Trail Tracker — Plan

A web app that imports your walks/runs/rides, shows them on a map of the UK,
overlays National Trails and LDWA long-distance paths, and shows how much of
each trail you have completed.

- **Audience:** friends and family (invite-only). Not expected to grow beyond that,
  but should be allowed to be used commercially.
- **Activity source:** Strava.
- **Trails:** National Trails + LDWA paths.
- **Budget:** free tiers only.
- **Hosting:** Cloudflare (free plan permits commercial use).

> Status: draft, 2026-11-03. Items marked **[verify]** are unconfirmed and should be
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

## 2. Architecture (Cloudflare free tier)

| Layer | Choice | Notes |
|---|---|---|
| Front end | Static SPA (Vite + TypeScript, or Next.js static export) on **Cloudflare Pages** | |
| Map | **MapLibre GL JS** | Open source |
| Base map tiles | **OpenFreeMap** / OSM-based vector tiles; optional OS Data Hub | OS premium free allowance **[verify]** |
| API | **Cloudflare Workers** (Hono router) | Free tier CPU time per request is small (~10 ms) **[verify]** |
| Database | **Cloudflare D1** (SQLite) | No PostGIS — see matching approach below |
| File storage | **Cloudflare R2** | Raw uploads / trail GeoJSON; free storage allowance **[verify]** |
| Auth | Invite-only email magic link (Worker + D1), or **Cloudflare Access** (free for small teams **[verify]**) | Access is the least code for friends & family |
| Static trail data | Pre-processed GeoJSON / PMTiles served from R2 or Pages | |

### Matching approach (why it runs in the browser)
D1 has no spatial extensions and free Workers have tight CPU limits, so heavy geometry work
should not run server-side. Instead:

1. **Offline pre-processing (build script, run once per data update):**
   - Load trail geometries (National Trails, later LDWA/OSM).
   - Split each trail into ~100 m segments; give each a stable ID, length and bounding box.
   - Publish as static files: a trail overview layer (simplified) plus per-trail segment
     files, and a simple grid index (e.g. 10 km tiles → segment IDs).
2. **In the browser (Web Worker):**
   - Parse the Strava export ZIP / GPX / FIT locally.
   - Simplify each track (e.g. Douglas–Peucker, ~5–10 m tolerance).
   - Use the grid index to load only nearby segments; mark a segment covered if the track
     passes within a threshold (start ~40 m, tune) along most of its length (using Turf.js).
   - Trim the first/last ~300 m of each track for privacy (configurable).
3. **Upload only results to the Worker:** covered segment IDs + dates + activity metadata,
   and the simplified (trimmed) track for display. Raw files never leave the device
   unless the user opts in.

Benefits: works within free limits, private by default, fast feedback.

### Data model (D1)
- `users` (id, email, display_name, created_at)
- `activities` (id, user_id, source [export|gpx|fit|strava], external_id, type, start_time,
  distance_m, simplified_track [encoded polyline], created_at)
- `trails` (id, name, source, licence, length_m, segment_count)
- `segment_coverage` (user_id, trail_id, segment_id, first_date, last_date, activity_id)
  — primary key (user_id, trail_id, segment_id)
- `invites` (code, created_by, used_by, expires_at)

Trail segment geometry lives in static files, not D1.

---

## 3. Phases

### Phase 0 — Groundwork (no code)
- [ ] Email LDWA (ldp@ldwa.org.uk) re permission / data.
- [ ] Download National Trails data (England + Wales); research Scotland.
- [ ] Ask on the LDWA Facebook thread what people currently use (competitor check).
- [ ] Confirm Cloudflare free-tier limits (Workers CPU, D1, R2, Access).
- [ ] Decide whether Strava API sync is worth it given the 7-day-cache question.

### Phase 1 — MVP (just you)
- [ ] Trail pre-processing script → static segment files + index.
- [ ] Map page: National Trails layer + your tracks.
- [ ] Import: Strava bulk export ZIP + GPX/FIT, processed in the browser.
- [ ] Coverage matching + per-trail % complete, covered vs missing sections.
- [ ] Per-trail page: distance done/remaining, gaps, contributing activities.
- [ ] Deploy to Cloudflare Pages + Worker + D1.

### Phase 2 — Friends & family
- [ ] Invite-only login (Cloudflare Access or magic link).
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
4. **Free-tier limits** — keep processing client-side; store only simplified tracks.
5. **Privacy** — tracks reveal home locations; trim start/end by default, private by default.

## 5. Open questions
- Which activity types count (walk/hike only, or runs and rides too)?
- Mobile-first or desktop-first?
- Name for the app?
