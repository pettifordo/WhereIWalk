// Named long-distance walking routes from OpenStreetMap, via the Overpass API.
//
// Data © OpenStreetMap contributors, available under the Open Database Licence (ODbL).
// We query national (nwn) and regional (rwn) walking route relations in Great Britain,
// fetch their geometry in batches, and keep routes of at least MIN_LENGTH_M that don't
// mostly duplicate a route we already load from official data.
import type pg from "pg";
import { slugify } from "./trails";

/** Public Overpass instances, tried in order (OVERPASS_URL overrides, for testing). */
export const OVERPASS_URLS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ];
export const MIN_LENGTH_M = 30_000;
/** Skip a route if this much of it lies within DUPLICATE_TOLERANCE_M of an official route. */
export const DUPLICATE_FRACTION = 0.7;
export const DUPLICATE_TOLERANCE_M = 50;
const USER_AGENT = "WhereIWalk/0.1 (+https://whereiwalk.vercel.app; free walking-progress app)";
/** Member roles that aren't part of the main line of a route. */
const SKIP_ROLES = new Set(["alternative", "excursion", "approach", "connection", "link", "spur", "detour"]);

export interface OsmRoute {
  ids: number[];
  name: string;
  network: string;
  lengthM: number;
  lines: number[][][]; // lon/lat
  tags: Record<string, string>;
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
}

/** Give up on one server after this long and try the next. */
const REQUEST_TIMEOUT_MS = 240_000;

async function overpassAt(url: string, query: string, attempt = 1): Promise<OverpassElement[]> {
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ data: query }),
  });
  if ((res.status === 429 || res.status === 504) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 30_000 * attempt)); // be polite, then retry
    return overpassAt(url, query, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}`);
  return ((await res.json()) as { elements: OverpassElement[] }).elements;
}

/** Last instance that worked, so later batches go straight to it. */
let preferred = 0;

async function overpass(query: string, log: (m: string) => void = console.log): Promise<OverpassElement[]> {
  const errors: string[] = [];
  for (let k = 0; k < OVERPASS_URLS.length; k++) {
    const i = (preferred + k) % OVERPASS_URLS.length;
    const t0 = Date.now();
    try {
      const out = await overpassAt(OVERPASS_URLS[i], query);
      if (i !== preferred) log(`osm: using ${new URL(OVERPASS_URLS[i]).host}`);
      preferred = i;
      return out;
    } catch (e) {
      const msg = `${new URL(OVERPASS_URLS[i]).host}: ${(e as Error).message} after ${Math.round((Date.now() - t0) / 1000)}s`;
      log(`osm: ${msg}`);
      errors.push(msg);
    }
  }
  throw new Error(`all Overpass servers failed — ${errors.join(" | ")}`);
}

const R = 6371008.8;
function lineLength(line: number[][]): number {
  let d = 0;
  for (let i = 1; i < line.length; i++) {
    const [lon1, lat1] = line[i - 1].map((v) => (v * Math.PI) / 180);
    const [lon2, lat2] = line[i].map((v) => (v * Math.PI) / 180);
    const s = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
    d += 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  return d;
}

/** Normalise a route name for comparing with official route names. */
export const nameKey = (n: string) => slugify(n.replace(/\b(national trail|the)\b/gi, ""));

/** Turn relations (with member geometry) into routes, merging relations that share a name. */
export function routesFromElements(elements: OverpassElement[]): OsmRoute[] {
  const byName = new Map<string, OsmRoute>();
  for (const el of elements) {
    if (el.type !== "relation" || !el.tags?.name) continue;
    const lines = (el.members ?? [])
      .filter((m) => m.type === "way" && m.geometry && m.geometry.length >= 2 && !SKIP_ROLES.has(m.role))
      .map((m) => m.geometry!.map((p) => [p.lon, p.lat]));
    if (!lines.length) continue;
    const name = el.tags.name.trim();
    const key = nameKey(name);
    const existing = byName.get(key);
    const lengthM = lines.reduce((s, l) => s + lineLength(l), 0);
    if (existing) {
      existing.ids.push(el.id);
      existing.lines.push(...lines);
      existing.lengthM += lengthM;
    } else {
      byName.set(key, { ids: [el.id], name, network: el.tags.network ?? "", lengthM, lines, tags: el.tags });
    }
  }
  return [...byName.values()];
}

/** Download national/regional walking routes in Great Britain from Overpass. */
export async function downloadOsmRoutes(log = console.log): Promise<OsmRoute[]> {
  // A bounding box is much cheaper for Overpass than an area query; routes in the
  // Republic of Ireland that fall inside it are dropped afterwards (inGreatBritainOrNI).
  log("osm: listing routes...");
  const list = await overpass(`
    [out:json][timeout:180];
    rel["type"="route"]["route"~"^(hiking|foot|walking)$"]["network"~"^(nwn|rwn)$"]["name"](${UK_BBOX.join(",")});
    out tags;`, log);
  log(`osm: ${list.length} named national/regional walking route relations in GB`);
  const ids = list.map((e) => e.id);
  const elements: OverpassElement[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const batch = ids.slice(i, i + 80);
    log(`osm: fetching route shapes ${i + 1}-${i + batch.length} of ${ids.length}...`);
    elements.push(...(await overpass(`[out:json][timeout:180]; rel(id:${batch.join(",")}); out geom;`, log)));
    await new Promise((r) => setTimeout(r, 2000)); // gentle on a shared public service
  }
  const routes = routesFromElements(elements);
  const uk = routes.filter((r) => inGreatBritainOrNI(midpoint(r.lines)));
  if (uk.length < routes.length) log(`osm: ${routes.length - uk.length} routes outside the UK dropped`);
  return uk;
}

/** south, west, north, east (Overpass order) */
export const UK_BBOX = [49.8, -8.7, 60.95, 1.9];

/** Rough outline of Northern Ireland, for telling it apart from the Republic of Ireland. */
const NORTHERN_IRELAND: [number, number][] = [
  [-8.18, 54.47], [-7.55, 54.12], [-7.0, 54.25], [-6.27, 54.1], [-5.43, 54.25],
  [-5.43, 55.25], [-6.2, 55.32], [-7.25, 55.25], [-7.65, 55.2], [-7.4, 54.95], [-8.18, 54.47],
];

function insidePolygon([x, y]: [number, number], poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Approximate midpoint of a route (middle vertex of its longest line). */
export function midpoint(lines: number[][][]): [number, number] {
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), lines[0]);
  const p = longest[Math.floor(longest.length / 2)];
  return [p[0], p[1]];
}

/**
 * True unless the point is in the Republic of Ireland part of the bounding box. Great
 * Britain's westernmost islands (Scilly, Hebrides, Kintyre) are south or north of it.
 */
export function inGreatBritainOrNI(p: [number, number]): boolean {
  const [lon, lat] = p;
  const irelandBox = lon < -5.95 && lat > 51.3 && lat < 55.45;
  return !irelandBox || insidePolygon(p, NORTHERN_IRELAND);
}

export interface Candidate extends OsmRoute {
  duplicateOf: string | null;
  overlap: number;
}

/**
 * Compare routes with the official routes already in the database (read-only) and
 * flag likely duplicates. Also flags routes whose name matches an official route.
 */
export async function checkDuplicates(db: Pick<pg.Pool, "query">, routes: OsmRoute[]): Promise<Candidate[]> {
  const official = (await db.query<{ name: string }>(`SELECT DISTINCT name FROM trails WHERE source_id <> 'osm-routes' OR source_id IS NULL`)).rows;
  const officialKeys = new Map(official.map((o) => [nameKey(o.name), o.name]));
  const out: Candidate[] = [];
  for (const r of routes) {
    const byName = officialKeys.get(nameKey(r.name)) ?? null;
    const res = await db.query<{ overlap: number; nearest: string | null }>(
      `
      WITH g AS (SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 27700) AS g),
      near AS (
        SELECT t.name, ST_Length(ST_Intersection((SELECT g FROM g), ST_Buffer(ST_Collect(s.geom_bng), $2))) AS len
        FROM trail_segments s JOIN trails t ON t.id = s.trail_id
        WHERE (t.source_id <> 'osm-routes' OR t.source_id IS NULL)
          AND ST_DWithin(s.geom_bng, (SELECT g FROM g), $2)
        GROUP BY t.name
      )
      SELECT COALESCE(max(len), 0) / NULLIF(ST_Length((SELECT g FROM g)), 0) AS overlap,
             (SELECT name FROM near ORDER BY len DESC LIMIT 1) AS nearest
      FROM near
      `,
      [JSON.stringify({ type: "MultiLineString", coordinates: r.lines }), DUPLICATE_TOLERANCE_M],
    );
    const overlap = Number(res.rows[0]?.overlap ?? 0);
    const dup = byName ?? (overlap >= DUPLICATE_FRACTION ? res.rows[0]?.nearest ?? null : null);
    out.push({ ...r, duplicateOf: dup, overlap });
  }
  return out;
}

export const osmSlug = (name: string) => `osm-${slugify(name)}`;
