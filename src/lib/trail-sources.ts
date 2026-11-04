// Where trail data comes from, how to download it, and how to load it.
//
// Each source has a `version`. db:setup (run on every Vercel build) loads any
// source whose version is newer than the one recorded in trail_source_loads, so
// adding a source or bumping a version is enough to get it into production.
import type pg from "pg";
import { computeCoverage } from "./coverage";
import { MIN_LENGTH_M, checkDuplicates, downloadOsmRoutes, osmSlug } from "./osm-routes";
import { segmentTrail, slugify, upsertTrail, type TrailCategory } from "./trails";

/** One trail ready to load: geometry is always a MultiLineString. */
export interface TrailRecord {
  name: string;
  slug: string;
  category: TrailCategory;
  series: string | null;
  srid: 4326 | 27700;
  geometry: { type: "MultiLineString"; coordinates: number[][][] };
}

export interface TrailSource {
  id: string;
  version: number;
  /** Shown on the About page. */
  label: string;
  source: string;
  licence: string;
  attribution: string;
  /** Human-readable licence name, e.g. "Open Government Licence v3.0". */
  licenceName: string;
  /** Sources can be switched off; disabled sources are skipped by db:setup. Default: enabled. */
  enabled?: boolean;
  download(ctx: { pool: pg.Pool; log: (m: string) => void }): Promise<TrailRecord[]>;
}

const NE_ATTRIBUTION = () =>
  `© Natural England copyright. Contains Ordnance Survey data © Crown copyright and database right ${new Date().getFullYear()}.`;
const NRW_ATTRIBUTION =
  "Contains Natural Resources Wales information © Natural Resources Wales and Database Right. All rights Reserved. " +
  "Contains Ordnance Survey Data. Ordnance Survey Licence number AC0000849444. Crown Copyright and Database Right.";

export const ENGLAND_COAST_PATH = "King Charles III England Coast Path";

type Geom = { type: string; coordinates: unknown } | null;
interface Feature { properties: Record<string, unknown>; geometry: Geom }

/** Flatten LineString / MultiLineString geometries into a list of lines. */
export function linesOf(g: Geom): number[][][] {
  if (!g) return [];
  if (g.type === "LineString") return [g.coordinates as number[][]];
  if (g.type === "MultiLineString") return g.coordinates as number[][][];
  return [];
}

/** Group features by a key and merge each group's lines into one MultiLineString. */
export function groupLines(features: Feature[], key: (f: Feature) => string | null): Map<string, number[][][]> {
  const out = new Map<string, number[][][]>();
  for (const f of features) {
    const k = key(f);
    if (!k) continue;
    const lines = linesOf(f.geometry).filter((l) => l.length >= 2);
    if (!lines.length) continue;
    out.set(k, [...(out.get(k) ?? []), ...lines]);
  }
  return out;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}): ${url}`);
  return (await res.json()) as T;
}

/** Page through an ArcGIS feature layer as GeoJSON (lon/lat). */
async function arcgisFeatures(layerUrl: string, where: string, outFields: string): Promise<Feature[]> {
  const all: Feature[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const q = new URLSearchParams({
      where, outFields, outSR: "4326", f: "geojson",
      resultOffset: String(offset), resultRecordCount: String(page), orderByFields: "OBJECTID",
    });
    const fc = await getJson<{ features?: Feature[] }>(`${layerUrl}/query?${q}`);
    const got = fc.features ?? [];
    all.push(...got);
    if (got.length < page) break;
  }
  if (!all.length) throw new Error(`No features from ${layerUrl}`);
  return all;
}

/** All features of a DataMapWales (GeoServer WFS) layer, in British National Grid. */
async function walesWfs(typeName: string): Promise<Feature[]> {
  const q = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: typeName,
    outputFormat: "application/json", srsName: "EPSG:27700",
  });
  const fc = await getJson<{ features?: Feature[] }>(`https://datamap.gov.wales/geoserver/ows?${q}`);
  if (!fc.features?.length) throw new Error(`No features from ${typeName}`);
  return fc.features;
}

const multi = (coordinates: number[][][]) => ({ type: "MultiLineString" as const, coordinates });

export const SOURCES: TrailSource[] = [
  {
    id: "national-trails-england",
    version: 1,
    label: "National Trails (England)",
    source: "natural-england",
    licence: "OGL-UK-3.0",
    licenceName: "Open Government Licence v3.0",
    attribution: NE_ATTRIBUTION(),
    async download() {
      const fs = await arcgisFeatures(
        "https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/National_Trails_England/FeatureServer/0",
        "1=1", "Name",
      );
      return [...groupLines(fs, (f) => String(f.properties.Name ?? "").trim() || null)].map(([name, lines]) => ({
        name, slug: slugify(name), category: "national-trail", series: null, srid: 4326, geometry: multi(lines),
      }));
    },
  },
  {
    id: "national-trails-wales",
    version: 1,
    label: "National Trails (Wales)",
    source: "natural-resources-wales",
    licence: "OGL-UK-3.0",
    licenceName: "Open Government Licence v3.0",
    attribution: NRW_ATTRIBUTION,
    async download() {
      // Offa's Dyke is skipped: the England dataset already has the whole route.
      const names: Record<string, string> = {
        "Pembrokeshire Coast": "Pembrokeshire Coast Path",
        "Glyndwrs Way": "Glyndŵr's Way",
      };
      const fs = await walesWfs("inspire-nrw:NRW_NATIONAL_TRAIL");
      return [...groupLines(fs, (f) => names[String(f.properties.name ?? "").trim()] ?? null)].map(([name, lines]) => ({
        name, slug: slugify(name), category: "national-trail", series: null, srid: 27700, geometry: multi(lines),
      }));
    },
  },
  {
    id: "wales-coast-path",
    version: 1,
    label: "Wales Coast Path",
    source: "natural-resources-wales",
    licence: "OGL-UK-3.0",
    licenceName: "Open Government Licence v3.0",
    attribution: NRW_ATTRIBUTION,
    async download() {
      const fs = await walesWfs("inspire-nrw:NRW_WALES_COASTAL_PATH");
      const lines = [...groupLines(fs, () => "all").values()][0] ?? [];
      return [{
        name: "Wales Coast Path", slug: "wales-coast-path", category: "coast-path", series: null, srid: 27700,
        geometry: multi(lines),
      }];
    },
  },
  {
    id: "england-coast-path",
    version: 1,
    label: ENGLAND_COAST_PATH,
    source: "natural-england",
    licence: "OGL-UK-3.0",
    licenceName: "Open Government Licence v3.0",
    attribution: NE_ATTRIBUTION(),
    async download() {
      // Main route only (alternative routes excluded), one trail per named stretch.
      const fs = await arcgisFeatures(
        "https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/England_Coast_Path_Route/FeatureServer/0",
        "Alt_Route='No'", "Stretch",
      );
      return [...groupLines(fs, (f) => String(f.properties.Stretch ?? "").trim() || null)].map(([name, lines]) => ({
        name, slug: `england-coast-path-${slugify(name)}`, category: "coast-path", series: ENGLAND_COAST_PATH,
        srid: 4326, geometry: multi(lines),
      }));
    },
  },
  {
    id: "osm-routes",
    version: 1,
    // Off by default: public Overpass servers refused or timed out from Vercel's build
    // machines (Nov 2026). Set ENABLE_OSM_ROUTES=1 to try again.
    enabled: process.env.ENABLE_OSM_ROUTES === "1",
    label: "Famous routes (OpenStreetMap)",
    source: "openstreetmap",
    licence: "ODbL-1.0",
    licenceName: "Open Database Licence (ODbL)",
    attribution: "Route data © OpenStreetMap contributors.",
    async download({ pool, log }) {
      const routes = (await downloadOsmRoutes(log)).filter((r) => r.lengthM >= MIN_LENGTH_M);
      log(`osm: ${routes.length} routes of ${MIN_LENGTH_M / 1000} km or more`);
      const checked = await checkDuplicates(pool, routes);
      const keep = checked.filter((r) => !r.duplicateOf);
      const dups = checked.filter((r) => r.duplicateOf);
      log(`osm: ${dups.length} skipped as duplicates of official routes: ` +
        dups.map((d) => `${d.name} (≈${d.duplicateOf}, ${Math.round(d.overlap * 100)}%)`).join("; "));
      const totalKm = keep.reduce((s, r) => s + r.lengthM, 0) / 1000;
      log(`osm: keeping ${keep.length} routes, ${Math.round(totalKm)} km in total`);
      for (const r of [...keep].sort((a, b) => b.lengthM - a.lengthM)) {
        log(`osm:   ${r.name} — ${Math.round(r.lengthM / 1000)} km (${r.network}, relation ${r.ids.join("+")})`);
      }
      return keep.map((r) => ({
        name: r.name, slug: osmSlug(r.name), category: "famous-route" as const, series: null, srid: 4326 as const,
        geometry: multi(r.lines),
      }));
    },
  },
];

/**
 * Load one source: upsert its trails, re-cut their segments, recompute everyone's
 * coverage for them, drop trails the source no longer contains, and record the version.
 *
 * With a deadline, stops early when time runs out and records the load as incomplete;
 * the next run resumes, skipping trails already loaded in this attempt.
 * Returns true if the source finished loading.
 */
export async function loadSource(
  pool: pg.Pool,
  src: TrailSource,
  records: TrailRecord[],
  log = console.log,
  opts: { deadline?: number } = {},
): Promise<boolean> {
  const prev = (await pool.query<{ version: number; complete: boolean; started_at: string | null }>(
    `SELECT version, complete, started_at FROM trail_source_loads WHERE source_id = $1`, [src.id],
  )).rows[0];
  const resuming = prev && prev.version === src.version && !prev.complete && prev.started_at;
  const startedAt = resuming ? prev.started_at! : new Date().toISOString();
  await pool.query(
    `INSERT INTO trail_source_loads (source_id, version, complete, started_at) VALUES ($1, $2, false, $3)
     ON CONFLICT (source_id) DO UPDATE SET version = EXCLUDED.version, complete = false, started_at = EXCLUDED.started_at`,
    [src.id, src.version, startedAt],
  );
  const done = new Set(
    resuming
      ? (await pool.query<{ slug: string }>(
          `SELECT slug FROM trails WHERE source_id = $1 AND updated_at >= $2`, [src.id, startedAt],
        )).rows.map((r) => r.slug)
      : [],
  );
  if (resuming) log(`${src.id}: resuming, ${done.size} of ${records.length} already loaded`);

  const activityIds = (await pool.query<{ id: string }>(`SELECT id FROM activities`)).rows.map((r) => Number(r.id));
  for (const r of records) {
    if (done.has(r.slug)) continue;
    if (opts.deadline && Date.now() > opts.deadline) {
      log(`${src.id}: out of time, ${done.size} of ${records.length} loaded; the next deploy will continue`);
      return false;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const trailId = await upsertTrail(client, {
        name: r.name, slug: r.slug, category: r.category, series: r.series, sourceId: src.id,
        source: src.source, licence: src.licence, attribution: src.attribution, geometry: r.geometry, srid: r.srid,
      });
      const n = await segmentTrail(client, trailId);
      const covered = await computeCoverage(activityIds, { trailId, db: client });
      await client.query("COMMIT");
      done.add(r.slug);
      log(`${src.id}: ${r.name}: ${n} segments, ${covered} coverage rows`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  const gone = await pool.query<{ name: string }>(
    `DELETE FROM trails WHERE source_id = $1 AND NOT (slug = ANY($2::text[])) RETURNING name`,
    [src.id, records.map((r) => r.slug)],
  );
  for (const g of gone.rows) log(`${src.id}: removed ${g.name} (no longer in source)`);
  await pool.query(`UPDATE trail_source_loads SET complete = true, loaded_at = now() WHERE source_id = $1`, [src.id]);
  return true;
}

/** Sources not yet loaded at their current version. */
export async function pendingSources(pool: pg.Pool, opts: { readOnly?: boolean } = {}): Promise<TrailSource[]> {
  // Databases set up before versioning existed already hold the England National Trails.
  if (!opts.readOnly) await pool.query(
    `INSERT INTO trail_source_loads (source_id, version)
     SELECT 'national-trails-england', 1
     WHERE EXISTS (SELECT 1 FROM trails WHERE source_id = 'national-trails-england')
     ON CONFLICT DO NOTHING`,
  );
  const loaded = new Map(
    (await pool.query<{ source_id: string; version: number }>(`SELECT source_id, version FROM trail_source_loads`)).rows
      .map((r) => [r.source_id, r.version]),
  );
  // `complete` was added later; a database not yet migrated (e.g. seen from a preview build) has none.
  const incomplete = new Set(
    (await pool.query<{ source_id: string }>(`SELECT source_id FROM trail_source_loads WHERE NOT complete`)
      .then((r) => r.rows, () => [])).map((r) => r.source_id),
  );
  return SOURCES.filter((s) => s.enabled !== false && ((loaded.get(s.id) ?? 0) < s.version || incomplete.has(s.id)));
}
