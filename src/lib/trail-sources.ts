// Where trail data comes from, and how to download and load it.
import type pg from "pg";
import { computeCoverage } from "./coverage";
import { segmentTrail, upsertTrail } from "./trails";

export interface TrailSource {
  id: string;
  /** Saved under data/<file> by trails:fetch */
  file: string;
  url: string;
  source: string;
  licence: string;
  attribution: string;
  nameField: string;
}

export const SOURCES: TrailSource[] = [
  {
    id: "national-trails-england",
    file: "national-trails-england.geojson",
    url:
      "https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/National_Trails_England/FeatureServer/0/query?" +
      new URLSearchParams({ where: "1=1", outFields: "Name,Start,End_,Length_Km", outSR: "4326", f: "geojson" }),
    source: "natural-england",
    licence: "OGL-UK-3.0",
    attribution: `© Natural England copyright. Contains Ordnance Survey data © Crown copyright and database right ${new Date().getFullYear()}.`,
    nameField: "Name",
  },
];

export interface FeatureCollection {
  features: { properties: Record<string, unknown>; geometry: unknown }[];
}

export async function downloadSource(src: TrailSource): Promise<FeatureCollection> {
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`${src.id}: download failed (HTTP ${res.status})`);
  const fc = (await res.json()) as FeatureCollection;
  if (!fc.features?.length) throw new Error(`${src.id}: no features returned`);
  return fc;
}

/** Load one source's trails, re-cut segments, and recompute coverage for them. */
export async function loadSource(pool: pg.Pool, src: TrailSource, fc: FeatureCollection, log = console.log) {
  for (const f of fc.features) {
    const name = String(f.properties[src.nameField]).trim();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const trailId = await upsertTrail(client, {
        name, source: src.source, licence: src.licence, attribution: src.attribution, geometry: f.geometry,
      });
      const n = await segmentTrail(client, trailId);
      const acts = await client.query<{ id: string }>(`SELECT id FROM activities`);
      const covered = await computeCoverage(acts.rows.map((r) => Number(r.id)), { trailId, db: client });
      await client.query("COMMIT");
      log(`${name}: ${n} segments, ${covered} coverage rows`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
