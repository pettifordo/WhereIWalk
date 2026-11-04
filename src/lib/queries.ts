import { query } from "./db";
import type { TrailCategory } from "./trails";

export interface TrailSummary {
  id: number;
  slug: string;
  name: string;
  category: TrailCategory;
  series: string | null;
  length_m: number;
  covered_m: number;
  first_walked: string | null;
  last_walked: string | null;
}

/** Every trail with how much of it the user has covered. */
export async function trailSummaries(userId: number): Promise<TrailSummary[]> {
  return query<TrailSummary>(
    `
    WITH covered AS (
      SELECT s.trail_id, s.id, s.length_m, min(c.covered_on) AS first_on, max(c.covered_on) AS last_on
      FROM segment_coverage c JOIN trail_segments s ON s.id = c.segment_id
      WHERE c.user_id = $1
      GROUP BY s.trail_id, s.id, s.length_m
    )
    SELECT t.id, t.slug, t.name, t.category, t.series, t.length_m,
           COALESCE(sum(cv.length_m), 0)::float8 AS covered_m,
           min(cv.first_on)::text AS first_walked,
           max(cv.last_on)::text AS last_walked
    FROM trails t LEFT JOIN covered cv ON cv.trail_id = t.id
    GROUP BY t.id
    ORDER BY t.name
    `,
    [userId],
  );
}

type FeatureCollection = { type: "FeatureCollection"; features: unknown[] };

/** Simplified outline of every trail for the overview map. */
export async function trailsOverview(): Promise<FeatureCollection> {
  const rows = await query<{ fc: FeatureCollection }>(
    `
    SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(json_build_object(
      'type', 'Feature',
      'properties', json_build_object('id', id, 'slug', slug, 'name', name, 'category', category),
      'geometry', ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(geom_bng, 25), 4326), 5)::json
    )), '[]'::json)) AS fc
    FROM trails
    `,
  );
  return rows[0].fc;
}

/** The user's covered trail sections, merged per trail, for the overview map. */
export async function coveredOverview(userId: number): Promise<FeatureCollection> {
  const rows = await query<{ fc: FeatureCollection }>(
    `
    WITH segs AS (
      SELECT DISTINCT s.id, s.trail_id, s.geom_bng
      FROM segment_coverage c JOIN trail_segments s ON s.id = c.segment_id
      WHERE c.user_id = $1
    ), merged AS (
      SELECT trail_id, ST_SimplifyPreserveTopology(ST_LineMerge(ST_Collect(geom_bng)), 10) AS g
      FROM segs GROUP BY trail_id
    )
    SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(json_build_object(
      'type', 'Feature',
      'properties', json_build_object('trail_id', trail_id),
      'geometry', ST_AsGeoJSON(ST_Transform(g, 4326), 5)::json
    )), '[]'::json)) AS fc
    FROM merged
    `,
    [userId],
  );
  return rows[0].fc;
}

/** Distance hidden at each end of a track on the map, so home locations aren't shown. */
export const PRIVACY_TRIM_M = 200;

/**
 * The user's tracks for display. Single-line tracks longer than 4x the trim distance
 * have their first/last PRIVACY_TRIM_M hidden; others are shown as stored.
 */
export async function tracksOverview(userId: number): Promise<FeatureCollection> {
  const rows = await query<{ fc: FeatureCollection }>(
    `
    WITH a AS (
      SELECT id, name, activity_type, start_time, geom_bng,
             ST_Length(geom_bng) AS len, ST_NumGeometries(geom_bng) AS n
      FROM activities WHERE user_id = $1
    ), trimmed AS (
      SELECT id, name, activity_type, start_time,
             CASE WHEN n = 1 AND len > 4 * $2
                  THEN ST_LineSubstring(ST_GeometryN(geom_bng, 1), $2 / len, 1 - $2 / len)
                  ELSE geom_bng END AS g
      FROM a
    )
    SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(json_build_object(
      'type', 'Feature',
      'properties', json_build_object('id', id, 'name', name, 'type', activity_type, 'date', start_time::date),
      'geometry', ST_AsGeoJSON(ST_Transform(ST_Simplify(g, 10), 4326), 5)::json
    )), '[]'::json)) AS fc
    FROM trimmed
    `,
    [userId, PRIVACY_TRIM_M],
  );
  return rows[0].fc;
}

export interface TrailRun {
  part: number;
  covered: boolean;
  /** Distance from the start of this part of the trail. */
  from_m: number;
  length_m: number;
  bbox: [number, number, number, number];
}

export interface TrailDetail {
  trail: TrailSummary & { attribution: string; licence: string; bbox: [number, number, number, number] };
  runs: TrailRun[];
  geojson: FeatureCollection;
  activities: { id: number; name: string | null; start_time: string | null; covered_m: number }[];
}

function parseBox(box: string): [number, number, number, number] {
  // PostGIS box2d text: BOX(minx miny,maxx maxy)
  const n = box.replace(/BOX\(|\)/g, "").split(/[ ,]/).map(Number);
  return [n[0], n[1], n[2], n[3]];
}

/** One trail: covered/uncovered runs (gaps), map geometry and contributing activities. */
export async function trailDetail(userId: number, slug: string): Promise<TrailDetail | null> {
  const summary = (await trailSummaries(userId)).find((t) => t.slug === slug);
  if (!summary) return null;
  const [meta] = await query<{ attribution: string; licence: string; bbox: string }>(
    `SELECT attribution, licence, ST_Extent(geom)::text AS bbox FROM trails WHERE id = $1 GROUP BY attribution, licence`,
    [summary.id],
  );

  // Gaps-and-islands: consecutive segments with the same covered state form one run.
  const runs = await query<{ part: number; covered: boolean; from_m: number; length_m: number; bbox: string; geometry: unknown }>(
    `
    WITH s AS (
      SELECT seg.part, seg.seq, seg.start_m, seg.length_m, seg.geom_bng,
             EXISTS (SELECT 1 FROM segment_coverage c WHERE c.segment_id = seg.id AND c.user_id = $1) AS covered
      FROM trail_segments seg WHERE seg.trail_id = $2
    ), g AS (
      SELECT *, seq - row_number() OVER (PARTITION BY part, covered ORDER BY seq) AS grp FROM s
    ), runs AS (
      SELECT part, covered, min(seq) AS first_seq, min(start_m)::float8 AS from_m, sum(length_m)::float8 AS length_m,
             ST_LineMerge(ST_Collect(geom_bng ORDER BY seq)) AS g
      FROM g GROUP BY part, covered, grp
    )
    SELECT part, covered, from_m, length_m,
           ST_Extent(ST_Transform(g, 4326))::text AS bbox,
           ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(g, 8), 4326), 5)::json AS geometry
    FROM runs
    GROUP BY part, covered, from_m, length_m, first_seq, g
    ORDER BY part, first_seq
    `,
    [userId, summary.id],
  );

  const activities = await query<{ id: number; name: string | null; start_time: string | null; covered_m: number }>(
    `
    SELECT a.id::int, a.name, a.start_time, sum(s.length_m)::float8 AS covered_m
    FROM segment_coverage c
    JOIN trail_segments s ON s.id = c.segment_id
    JOIN activities a ON a.id = c.activity_id
    WHERE c.user_id = $1 AND s.trail_id = $2
    GROUP BY a.id
    ORDER BY a.start_time NULLS LAST
    `,
    [userId, summary.id],
  );

  return {
    trail: { ...summary, attribution: meta.attribution, licence: meta.licence, bbox: parseBox(meta.bbox) },
    runs: runs.map((r) => ({
      part: r.part, covered: r.covered, from_m: r.from_m, length_m: r.length_m, bbox: parseBox(r.bbox),
    })),
    geojson: {
      type: "FeatureCollection",
      features: runs.map((r, i) => ({
        type: "Feature",
        properties: { covered: r.covered, run: i },
        geometry: r.geometry,
      })),
    },
    activities,
  };
}

export const LICENCE_NAMES: Record<string, string> = {
  "OGL-UK-3.0": "Open Government Licence v3.0",
  "ODbL-1.0": "Open Database Licence (ODbL)",
};
export const licenceName = (code: string) => LICENCE_NAMES[code] ?? code;

/** One line per data source in use, e.g. "© Natural England ... Open Government Licence v3.0." */
export async function attributions(): Promise<string[]> {
  const rows = await query<{ attribution: string; licence: string }>(`SELECT DISTINCT attribution, licence FROM trails ORDER BY licence, attribution`);
  return rows.map((r) => `${r.attribution} ${licenceName(r.licence)}.`);
}
