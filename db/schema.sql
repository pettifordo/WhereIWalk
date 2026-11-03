-- WhereIWalk schema. Idempotent: safe to run repeatedly (npm run db:migrate).
--
-- Geometry is stored twice:
--   geom      EPSG:4326 (lon/lat) for display on the web map
--   geom_bng  EPSG:27700 (British National Grid, metres) for distance/coverage maths
-- BNG is accurate across Great Britain and lets the spatial indexes work in metres.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id            serial PRIMARY KEY,
  email         text UNIQUE NOT NULL,
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trails (
  id           serial PRIMARY KEY,
  slug         text UNIQUE NOT NULL,
  name         text NOT NULL,
  source       text NOT NULL,          -- e.g. 'natural-england'
  licence      text NOT NULL,          -- e.g. 'OGL-UK-3.0'
  attribution  text NOT NULL,
  length_m     double precision NOT NULL,
  geom         geometry(MultiLineString, 4326) NOT NULL,
  geom_bng     geometry(MultiLineString, 27700) NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Each trail is cut into short pieces (~100 m) so coverage can be tracked piecewise.
-- part = which continuous line of the trail (some trails have branches/gaps),
-- seq  = order along that part, start_m = distance from the start of that part.
CREATE TABLE IF NOT EXISTS trail_segments (
  id        bigserial PRIMARY KEY,
  trail_id  int NOT NULL REFERENCES trails(id) ON DELETE CASCADE,
  part      int NOT NULL,
  seq       int NOT NULL,
  start_m   double precision NOT NULL,
  length_m  double precision NOT NULL,
  geom      geometry(LineString, 4326) NOT NULL,
  geom_bng  geometry(LineString, 27700) NOT NULL,
  UNIQUE (trail_id, part, seq)
);
CREATE INDEX IF NOT EXISTS trail_segments_geom_bng_idx ON trail_segments USING gist (geom_bng);

CREATE TABLE IF NOT EXISTS activities (
  id             bigserial PRIMARY KEY,
  user_id        int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source         text NOT NULL,          -- 'strava-export' | 'gpx' | 'tcx' | 'fit'
  fingerprint    text NOT NULL,          -- de-duplicates re-imports of the same activity
  name           text,
  activity_type  text,
  start_time     timestamptz,
  distance_m     double precision NOT NULL,
  geom           geometry(MultiLineString, 4326) NOT NULL,
  geom_bng       geometry(MultiLineString, 27700) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS activities_user_idx ON activities (user_id);
CREATE INDEX IF NOT EXISTS activities_geom_bng_idx ON activities USING gist (geom_bng);

-- One row per (segment, activity) that covered it. Deleting an activity removes its coverage.
CREATE TABLE IF NOT EXISTS segment_coverage (
  user_id      int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  segment_id   bigint NOT NULL REFERENCES trail_segments(id) ON DELETE CASCADE,
  activity_id  bigint NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  covered_on   date,
  PRIMARY KEY (user_id, segment_id, activity_id)
);
CREATE INDEX IF NOT EXISTS segment_coverage_activity_idx ON segment_coverage (activity_id);

-- People who may sign in, maintained by admins on the Invites page. Admins themselves
-- are listed in the ALLOWED_EMAILS environment variable and don't need a row here.
CREATE TABLE IF NOT EXISTS invites (
  email       text PRIMARY KEY CHECK (email = lower(email)),
  name        text,
  invited_by  int REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Trail grouping (added with the Wales and coast path datasets).
--   category: 'national-trail' | 'coast-path'
--   series:   a parent route for trails published in stretches, e.g. the
--             King Charles III England Coast Path; NULL for stand-alone trails
--   source_id: which entry in src/lib/trail-sources.ts the trail came from
ALTER TABLE trails ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'national-trail';
ALTER TABLE trails ADD COLUMN IF NOT EXISTS series text;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS source_id text;
UPDATE trails SET source_id = 'national-trails-england' WHERE source_id IS NULL AND source = 'natural-england';

-- Which version of each trail source has been loaded, so new or updated sources
-- are loaded automatically by db:setup on the next deploy.
CREATE TABLE IF NOT EXISTS trail_source_loads (
  source_id  text PRIMARY KEY,
  version    int NOT NULL,
  loaded_at  timestamptz NOT NULL DEFAULT now()
);
