// Runs before each Vercel build (see vercel.json): applies the schema, then
// downloads and loads any trail source that is new or has a newer version
// (src/lib/trail-sources.ts). Safe to run repeatedly.
import { readFile } from "node:fs/promises";
import { getPool } from "../src/lib/db";
import { loadSource, pendingSources } from "../src/lib/trail-sources";

if (!process.env.DATABASE_URL) {
  console.log("db:setup: DATABASE_URL not set, skipping.");
  process.exit(0);
}
const pool = getPool();
await pool.query(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));
console.log("db:setup: schema applied.");
const pending = await pendingSources(pool);
if (!pending.length) console.log("db:setup: all trail sources up to date.");
for (const src of pending) {
  console.log(`db:setup: loading ${src.id} v${src.version}...`);
  const records = await src.download();
  await loadSource(pool, src, records, (m) => console.log(`db:setup: ${m}`));
}
await pool.end();
