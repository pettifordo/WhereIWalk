import type pg from "pg";
import { SEGMENT_LENGTH_M } from "./coverage";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface TrailInput {
  name: string;
  source: string;
  licence: string;
  attribution: string;
  /** GeoJSON LineString or MultiLineString geometry in EPSG:4326 */
  geometry: unknown;
}

/** Insert or update a trail and return its id. */
export async function upsertTrail(db: Queryable, t: TrailInput): Promise<number> {
  const res = await db.query<{ id: number }>(
    `
    WITH g AS (
      SELECT ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))) AS geom
    ), b AS (
      SELECT geom, ST_Transform(geom, 27700) AS geom_bng FROM g
    )
    INSERT INTO trails (slug, name, source, licence, attribution, length_m, geom, geom_bng)
    SELECT $1, $2, $3, $4, $6, ST_Length(geom_bng), geom, geom_bng FROM b
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, source = EXCLUDED.source, licence = EXCLUDED.licence,
      attribution = EXCLUDED.attribution, length_m = EXCLUDED.length_m,
      geom = EXCLUDED.geom, geom_bng = EXCLUDED.geom_bng, updated_at = now()
    RETURNING id
    `,
    [slugify(t.name), t.name, t.source, t.licence, JSON.stringify(t.geometry), t.attribution],
  );
  return res.rows[0].id;
}

/**
 * (Re)build the ~100 m segments of a trail. Existing segments (and therefore coverage
 * for this trail) are deleted, so call computeCoverage afterwards.
 */
export async function segmentTrail(db: Queryable, trailId: number): Promise<number> {
  await db.query(`DELETE FROM trail_segments WHERE trail_id = $1`, [trailId]);
  const res = await db.query(
    `
    WITH parts AS (
      SELECT (ST_Dump(ST_LineMerge(geom_bng))).geom AS g
      FROM trails WHERE id = $1
    ), numbered AS (
      SELECT g, ST_Length(g) AS len,
             row_number() OVER (ORDER BY ST_Length(g) DESC) AS part
      FROM parts
      WHERE ST_Length(g) > 1
    ), pieces AS (
      SELECT part, i AS seq, i * $2::float8 AS start_m,
             ST_LineSubstring(g, (i * $2::float8) / len, LEAST(((i + 1) * $2::float8) / len, 1.0)) AS g
      FROM numbered, generate_series(0, GREATEST(ceil(len / $2::float8)::int - 1, 0)) AS i
    )
    INSERT INTO trail_segments (trail_id, part, seq, start_m, length_m, geom, geom_bng)
    SELECT $1, part, seq, start_m, ST_Length(g), ST_Transform(g, 4326), g
    FROM pieces
    WHERE ST_Length(g) > 0
    `,
    [trailId, SEGMENT_LENGTH_M],
  );
  return res.rowCount ?? 0;
}
