// Loads downloaded trail GeoJSON into the database, splits each trail into
// segments, and recomputes everyone's coverage for those trails.
// Run `npm run trails:fetch` first.
import { readFile } from "node:fs/promises";
import { getPool } from "../src/lib/db";
import { computeCoverage } from "../src/lib/coverage";
import { segmentTrail, upsertTrail } from "../src/lib/trails";

const SOURCES = [
  {
    file: "../data/national-trails-england.geojson",
    source: "natural-england",
    licence: "OGL-UK-3.0",
    attribution: `© Natural England copyright. Contains Ordnance Survey data © Crown copyright and database right ${new Date().getFullYear()}.`,
    nameField: "Name",
  },
];

const pool = getPool();
for (const src of SOURCES) {
  const fc = JSON.parse(await readFile(new URL(src.file, import.meta.url), "utf8")) as {
    features: { properties: Record<string, unknown>; geometry: unknown }[];
  };
  for (const f of fc.features) {
    const name = String(f.properties[src.nameField]).trim();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const trailId = await upsertTrail(client, {
        name,
        source: src.source,
        licence: src.licence,
        attribution: src.attribution,
        geometry: f.geometry,
      });
      const n = await segmentTrail(client, trailId);
      const acts = await client.query<{ id: number }>(`SELECT id FROM activities`);
      const covered = await computeCoverage(
        acts.rows.map((r) => Number(r.id)),
        { trailId, db: client },
      );
      await client.query("COMMIT");
      console.log(`${name}: ${n} segments, ${covered} coverage rows`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
await pool.end();
