// Runs before each Vercel build (see vercel.json): applies the schema, then
// downloads and loads any trail source that is new, updated, or part-loaded
// (src/lib/trail-sources.ts). Safe to run repeatedly.
//
// Only production builds (or local runs) load trail data. Preview builds share the
// production database, so they only download new sources and print a summary.
import { readFile } from "node:fs/promises";
import { getPool } from "../src/lib/db";
import { loadSource, pendingSources } from "../src/lib/trail-sources";

/** Leave time for `next build` within Vercel's build limit. */
const LOAD_BUDGET_MS = Number(process.env.TRAIL_LOAD_BUDGET_MS ?? 20 * 60_000);
const canWrite = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production";
const log = (m: string) => console.log(`db:setup: ${m}`);

if (!process.env.DATABASE_URL) {
  log("DATABASE_URL not set, skipping.");
  process.exit(0);
}
const pool = getPool();
if (canWrite) {
  await pool.query(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));
  log("schema applied.");
} else {
  log(`${process.env.VERCEL_ENV} build: read-only (no schema changes or trail loading).`);
}
const deadline = Date.now() + LOAD_BUDGET_MS;
const pending = await pendingSources(pool, { readOnly: !canWrite }).catch((e) => {
  log(`couldn't check trail sources (${(e as Error).message}); skipping.`);
  return [];
});
if (!pending.length) log("all trail sources up to date.");
for (const src of pending) {
  log(`${canWrite ? "loading" : "previewing"} ${src.id} v${src.version}...`);
  try {
    const records = await src.download({ pool, log });
    if (!canWrite) {
      log(`${src.id}: preview only, ${records.length} trails would be loaded.`);
      continue;
    }
    const finished = await loadSource(pool, src, records, log, { deadline });
    if (!finished) break;
  } catch (e) {
    // A failing download (e.g. a busy public API) shouldn't block deploying the app.
    log(`${src.id}: FAILED (${(e as Error).message}). Will retry on the next deploy.`);
  }
}
await pool.end();
