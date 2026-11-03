// Runs before each Vercel build (see vercel.json): applies the schema and, if the
// database has no trails yet, downloads and loads them. Safe to run repeatedly.
// To refresh trail data on purpose, run trails:fetch + trails:load instead.
import { readFile } from "node:fs/promises";
import { getPool } from "../src/lib/db";
import { SOURCES, downloadSource, loadSource } from "../src/lib/trail-sources";

if (!process.env.DATABASE_URL) {
  console.log("db:setup: DATABASE_URL not set, skipping.");
  process.exit(0);
}
const pool = getPool();
await pool.query(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));
console.log("db:setup: schema applied.");
const [{ n }] = (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM trails`)).rows;
if (n > 0) {
  console.log(`db:setup: ${n} trails already loaded, nothing to do.`);
} else {
  for (const src of SOURCES) await loadSource(pool, src, await downloadSource(src), (m) => console.log(`db:setup: ${m}`));
}
await pool.end();
