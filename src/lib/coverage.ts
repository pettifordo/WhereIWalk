import type pg from "pg";
import { getPool } from "./db";

/** A trail segment counts as walked if this much of it lies within TOLERANCE_M of a track. */
export const TOLERANCE_M = 40;
export const MIN_COVERED_FRACTION = 0.6;
/** Target length of each trail segment. */
export const SEGMENT_LENGTH_M = 100;

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/**
 * Work out which trail segments the given activities cover and record them.
 * If trailId is given, only segments of that trail are checked (used after re-loading a trail).
 * Returns the number of new coverage rows.
 */
export async function computeCoverage(
  activityIds: number[],
  opts: { trailId?: number; db?: Queryable } = {},
): Promise<number> {
  if (activityIds.length === 0) return 0;
  const db = opts.db ?? getPool();
  const res = await db.query(
    `
    WITH acts AS MATERIALIZED (
      SELECT id, user_id, start_time, geom_bng,
             ST_Buffer(geom_bng, $2) AS buf
      FROM activities
      WHERE id = ANY($1::bigint[])
    )
    INSERT INTO segment_coverage (user_id, segment_id, activity_id, covered_on)
    SELECT a.user_id, s.id, a.id, (a.start_time AT TIME ZONE 'Europe/London')::date
    FROM acts a
    JOIN trail_segments s ON ST_DWithin(s.geom_bng, a.geom_bng, $2)
    WHERE ($4::int IS NULL OR s.trail_id = $4)
      AND ST_Length(
            ST_Intersection(s.geom_bng, ST_ClipByBox2D(a.buf, ST_Expand(s.geom_bng, $2)::box2d))
          ) >= $3 * s.length_m
    ON CONFLICT DO NOTHING
    `,
    [activityIds, TOLERANCE_M, MIN_COVERED_FRACTION, opts.trailId ?? null],
  );
  return res.rowCount ?? 0;
}
