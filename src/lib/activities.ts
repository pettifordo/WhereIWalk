import { getPool, query } from "./db";
import { computeCoverage } from "./coverage";

export interface ActivityUpload {
  source: string;
  name: string | null;
  type: string | null;
  startTime: string | null;
  distanceM: number;
  lines: [number, number][][];
  fingerprint: string;
}

const SOURCES = new Set(["strava-export", "gpx", "tcx", "fit"]);
export const MAX_POINTS_PER_ACTIVITY = 50_000;
export const MAX_ACTIVITIES_PER_REQUEST = 25;

/** Validate untrusted JSON from the client. Throws with a readable message. */
export function validateUpload(raw: unknown): ActivityUpload {
  if (!raw || typeof raw !== "object") throw new Error("activity must be an object");
  const a = raw as Record<string, unknown>;
  if (typeof a.source !== "string" || !SOURCES.has(a.source)) throw new Error("invalid source");
  if (typeof a.fingerprint !== "string" || a.fingerprint.length === 0 || a.fingerprint.length > 200)
    throw new Error("invalid fingerprint");
  const str = (v: unknown, max: number) =>
    v == null ? null : typeof v === "string" ? v.slice(0, max) : (() => { throw new Error("invalid string"); })();
  const startTime = str(a.startTime, 40);
  if (startTime && Number.isNaN(Date.parse(startTime))) throw new Error("invalid startTime");
  if (typeof a.distanceM !== "number" || !Number.isFinite(a.distanceM) || a.distanceM < 0)
    throw new Error("invalid distanceM");
  if (!Array.isArray(a.lines) || a.lines.length === 0) throw new Error("lines required");
  let points = 0;
  for (const line of a.lines) {
    if (!Array.isArray(line) || line.length < 2) throw new Error("each line needs 2+ points");
    for (const p of line) {
      if (
        !Array.isArray(p) || p.length !== 2 ||
        typeof p[0] !== "number" || typeof p[1] !== "number" ||
        Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90
      )
        throw new Error("invalid coordinate");
    }
    points += line.length;
  }
  if (points > MAX_POINTS_PER_ACTIVITY) throw new Error("too many points");
  return {
    source: a.source,
    name: str(a.name, 200),
    type: str(a.type, 60),
    startTime,
    distanceM: a.distanceM,
    lines: a.lines as [number, number][][],
    fingerprint: a.fingerprint,
  };
}

export interface InsertResult {
  inserted: number;
  duplicates: number;
  segmentsCovered: number;
}

export async function insertActivities(userId: number, acts: ActivityUpload[]): Promise<InsertResult> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const ids: number[] = [];
    for (const a of acts) {
      const geojson = JSON.stringify({ type: "MultiLineString", coordinates: a.lines });
      const res = await client.query<{ id: string }>(
        `
        WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($8), 4326) AS geom)
        INSERT INTO activities
          (user_id, source, fingerprint, name, activity_type, start_time, distance_m, geom, geom_bng)
        SELECT $1, $2, $3, $4, $5, $6, $7, geom, ST_Transform(geom, 27700) FROM g
        ON CONFLICT (user_id, fingerprint) DO NOTHING
        RETURNING id
        `,
        [userId, a.source, a.fingerprint, a.name, a.type, a.startTime, a.distanceM, geojson],
      );
      if (res.rows[0]) ids.push(Number(res.rows[0].id));
    }
    const segmentsCovered = await computeCoverage(ids, { db: client });
    await client.query("COMMIT");
    return { inserted: ids.length, duplicates: acts.length - ids.length, segmentsCovered };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteActivity(userId: number, id: number): Promise<boolean> {
  const rows = await query(`DELETE FROM activities WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
  return rows.length > 0;
}

export interface ActivityRow {
  id: number;
  name: string | null;
  activity_type: string | null;
  start_time: string | null;
  distance_m: number;
  source: string;
  segments: number;
}

export async function listActivities(userId: number): Promise<ActivityRow[]> {
  return query<ActivityRow>(
    `
    SELECT a.id::int, a.name, a.activity_type, a.start_time, a.distance_m, a.source,
           (SELECT count(*)::int FROM segment_coverage c WHERE c.activity_id = a.id) AS segments
    FROM activities a
    WHERE a.user_id = $1
    ORDER BY a.start_time DESC NULLS LAST, a.id DESC
    `,
    [userId],
  );
}
