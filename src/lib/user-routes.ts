// Routes uploaded by members ("community" category). Private to the uploader until an
// admin shares them. See db/schema.sql for the columns involved.
import { randomBytes } from "node:crypto";
import { getPool, query } from "./db";
import { computeCoverage } from "./coverage";
import { visibleTo } from "./queries";
import { segmentTrail, slugify, upsertTrail } from "./trails";

export const USER_SOURCE_ID = "user-upload";
export const MAX_ROUTE_POINTS = 100_000;
export const MAX_ROUTE_KM = 2_000;
export const MIN_ROUTE_KM = 1;
/** Report a possible duplicate when at least this much of the upload follows a visible route. */
export const SIMILAR_FRACTION = 0.3;
const TOLERANCE_M = 50;

export interface RouteUpload {
  name: string;
  description: string | null;
  lines: [number, number][][];
}

/** Validate untrusted JSON for a route upload. Throws with a readable message. */
export function validateRouteUpload(raw: unknown): RouteUpload {
  if (!raw || typeof raw !== "object") throw new Error("Route must be an object");
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 120) : "";
  if (name.length < 2) throw new Error("Please give the route a name");
  const description = typeof r.description === "string" ? r.description.trim().slice(0, 1000) || null : null;
  if (!Array.isArray(r.lines) || r.lines.length === 0) throw new Error("The file has no route line");
  let points = 0;
  for (const line of r.lines) {
    if (!Array.isArray(line) || line.length < 2) throw new Error("Each line needs 2 or more points");
    for (const p of line) {
      if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "number" || typeof p[1] !== "number" ||
          Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) throw new Error("Invalid coordinate");
    }
    points += line.length;
  }
  if (points > MAX_ROUTE_POINTS) throw new Error("That route has too many points");
  return { name, description, lines: r.lines as [number, number][][] };
}

const geojson = (lines: [number, number][][]) => JSON.stringify({ type: "MultiLineString", coordinates: lines });

export interface SimilarRoute { name: string; slug: string; overlap: number; mine: boolean }

/**
 * Which routes the user can already see does this upload follow? `overlap` is the
 * fraction of the upload within 50 m of that route. Also returns the upload's length.
 */
export async function findSimilarRoutes(userId: number, lines: [number, number][][]): Promise<{ lengthKm: number; similar: SimilarRoute[] }> {
  const rows = await query<{ name: string; slug: string; overlap: number; mine: boolean; total_m: number }>(
    `
    WITH g AS (SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 27700) AS g),
    cand AS (
      SELECT t.id, t.name, t.slug, (t.owner_id = $2) AS mine,
             ST_Length(ST_Intersection((SELECT g FROM g), ST_Buffer(ST_Collect(s.geom_bng), $3))) AS len
      FROM trail_segments s JOIN trails t ON t.id = s.trail_id
      WHERE ${visibleTo("t", "$2")} AND ST_DWithin(s.geom_bng, (SELECT g FROM g), $3)
      GROUP BY t.id
    )
    SELECT c.name, c.slug, COALESCE(c.mine, false) AS mine, c.len / NULLIF(ST_Length((SELECT g FROM g)), 0) AS overlap,
           ST_Length((SELECT g FROM g)) AS total_m
    FROM cand c
    UNION ALL SELECT NULL, NULL, false, NULL, ST_Length((SELECT g FROM g))
    ORDER BY overlap DESC NULLS LAST
    `,
    [geojson(lines), userId, TOLERANCE_M],
  );
  const lengthKm = (rows[0]?.total_m ?? 0) / 1000;
  const similar = rows
    .filter((r) => r.name && r.overlap >= SIMILAR_FRACTION)
    .slice(0, 3)
    .map((r) => ({ name: r.name, slug: r.slug, overlap: Math.min(1, r.overlap), mine: r.mine }));
  return { lengthKm, similar };
}

/** Save a member's route (private), cut it into segments and match the member's walks. */
export async function createUserRoute(userId: number, uploaderName: string, r: RouteUpload): Promise<string> {
  const { lengthKm, similar } = await findSimilarRoutes(userId, r.lines);
  if (lengthKm < MIN_ROUTE_KM) throw new Error(`Routes need to be at least ${MIN_ROUTE_KM} km long`);
  if (lengthKm > MAX_ROUTE_KM) throw new Error(`Routes can be at most ${MAX_ROUTE_KM} km long`);
  const slug = `u${userId}-${slugify(r.name).slice(0, 60)}-${randomBytes(3).toString("hex")}`;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const id = await upsertTrail(client, {
      name: r.name, slug, category: "community", series: null, sourceId: USER_SOURCE_ID,
      source: "member-upload", licence: "member-upload", attribution: `Uploaded by ${uploaderName}.`,
      geometry: { type: "MultiLineString", coordinates: r.lines }, srid: 4326,
    });
    await client.query(
      `UPDATE trails SET owner_id = $2, shared = false, description = $3, similar_to = $4, similar_overlap = $5 WHERE id = $1`,
      [id, userId, r.description, similar[0]?.name ?? null, similar[0]?.overlap ?? null],
    );
    await segmentTrail(client, id);
    const mine = await client.query<{ id: string }>(`SELECT id FROM activities WHERE user_id = $1`, [userId]);
    await computeCoverage(mine.rows.map((x) => Number(x.id)), { trailId: id, db: client });
    await client.query("COMMIT");
    return slug;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export interface UploadedRoute {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  length_m: number;
  shared: boolean;
  created_at: string;
  owner_id: number;
  owner: string;
  similar_to: string | null;
  similar_overlap: number | null;
}

const UPLOAD_COLUMNS = `t.id, t.slug, t.name, t.description, t.length_m, t.shared, t.created_at::text, t.owner_id,
  COALESCE(u.display_name, u.email) AS owner, t.similar_to, t.similar_overlap`;

export async function listMyRoutes(userId: number): Promise<UploadedRoute[]> {
  return query<UploadedRoute>(
    `SELECT ${UPLOAD_COLUMNS} FROM trails t JOIN users u ON u.id = t.owner_id WHERE t.owner_id = $1 ORDER BY t.created_at DESC`,
    [userId],
  );
}

/** Every member upload, for admins. */
export async function listAllUploads(): Promise<UploadedRoute[]> {
  return query<UploadedRoute>(
    `SELECT ${UPLOAD_COLUMNS} FROM trails t JOIN users u ON u.id = t.owner_id ORDER BY t.shared, t.created_at DESC`,
  );
}

/**
 * Share or unshare uploads with everyone. Sharing matches every member's walks against
 * the route (previously only the uploader's were matched).
 */
export async function setShared(ids: number[], shared: boolean): Promise<number> {
  if (!ids.length) return 0;
  const res = await query<{ id: number }>(
    `UPDATE trails SET shared = $2, shared_at = CASE WHEN $2 THEN now() ELSE NULL END
     WHERE id = ANY($1::int[]) AND owner_id IS NOT NULL AND shared <> $2 RETURNING id`,
    [ids, shared],
  );
  if (shared && res.length) {
    const all = (await query<{ id: string }>(`SELECT id FROM activities`)).map((r) => Number(r.id));
    for (const r of res) await computeCoverage(all, { trailId: r.id });
  }
  return res.length;
}

/** Delete an upload. Owners can delete their own; admins (allowAny) can delete any. */
export async function deleteUpload(id: number, userId: number, allowAny = false): Promise<boolean> {
  const rows = await query(
    `DELETE FROM trails WHERE id = $1 AND owner_id IS NOT NULL AND ($3 OR owner_id = $2) RETURNING id`,
    [id, userId, allowAny],
  );
  return rows.length > 0;
}
