// Re-download and reload trail sources, even if already loaded (e.g. after the
// publisher updates their data). Usage:
//   npm run trails:load                      # all sources
//   npm run trails:load -- wales-coast-path  # just these source ids
import { getPool } from "../src/lib/db";
import { SOURCES, loadSource } from "../src/lib/trail-sources";

const wanted = process.argv.slice(2);
const unknown = wanted.filter((id) => !SOURCES.some((s) => s.id === id));
if (unknown.length) throw new Error(`Unknown source(s): ${unknown.join(", ")}. Known: ${SOURCES.map((s) => s.id).join(", ")}`);
const pool = getPool();
for (const src of SOURCES.filter((s) => !wanted.length || wanted.includes(s.id))) {
  console.log(`Loading ${src.id}...`);
  await loadSource(pool, src, await src.download());
}
await pool.end();
