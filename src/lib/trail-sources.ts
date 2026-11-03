// Where trail data comes from, how to download it, and how to load it.
//
// Each source has a `version`. db:setup (run on every Vercel build) loads any
// source whose version is newer than the one recorded in trail_source_loads, so
// adding a source or bumping a version is enough to get it into production.
import type pg from "pg";
import { computeCoverage } from "./coverage";
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
  download(): Promise<TrailRecord[]>;
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
];

/**
 * Load one source: upsert its trails, re-cut their segments, recompute everyone's
 * coverage for them, drop trails the source no longer contains, and record the version.
 */
export async function loadSource(pool: pg.Pool, src: TrailSource, records: TrailRecord[], log = console.log) {
  const ids: number[] = [];
  const activityIds = (await pool.query<{ id: string }>(`SELECT id FROM activities`)).rows.map((r) => Number(r.id));
  for (const r of records) {
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
      ids.push(trailId);
      log(`${src.id}: ${r.name}: ${n} segments, ${covered} coverage rows`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  const gone = await pool.query<{ name: string }>(
    `DELETE FROM trails WHERE source_id = $1 AND NOT (id = ANY($2::int[])) RETURNING name`,
    [src.id, ids],
  );
  for (const g of gone.rows) log(`${src.id}: removed ${g.name} (no longer in source)`);
  await pool.query(
    `INSERT INTO trail_source_loads (source_id, version) VALUES ($1, $2)
     ON CONFLICT (source_id) DO UPDATE SET version = EXCLUDED.version, loaded_at = now()`,
    [src.id, src.version],
  );
}

/** Sources not yet loaded at their current version. */
export async function pendingSources(pool: pg.Pool): Promise<TrailSource[]> {
  // Databases set up before versioning existed already hold the England National Trails.
  await pool.query(
    `INSERT INTO trail_source_loads (source_id, version)
     SELECT 'national-trails-england', 1
     WHERE EXISTS (SELECT 1 FROM trails WHERE source_id = 'national-trails-england')
     ON CONFLICT DO NOTHING`,
  );
  const loaded = new Map(
    (await pool.query<{ source_id: string; version: number }>(`SELECT source_id, version FROM trail_source_loads`)).rows
      .map((r) => [r.source_id, r.version]),
  );
  return SOURCES.filter((s) => (loaded.get(s.id) ?? 0) < s.version);
}
