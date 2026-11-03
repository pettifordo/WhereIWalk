// Loads downloaded trail GeoJSON (run `npm run trails:fetch` first) into the
// database, re-cuts segments and recomputes everyone's coverage for those trails.
import { readFile } from "node:fs/promises";
import { getPool } from "../src/lib/db";
import { SOURCES, loadSource, type FeatureCollection } from "../src/lib/trail-sources";

const pool = getPool();
for (const src of SOURCES) {
  const fc = JSON.parse(await readFile(new URL(`../data/${src.file}`, import.meta.url), "utf8")) as FeatureCollection;
  await loadSource(pool, src, fc);
}
await pool.end();
