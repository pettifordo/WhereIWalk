// Downloads trail datasets (see src/lib/trail-sources.ts) into data/.
import { mkdir, writeFile } from "node:fs/promises";
import { SOURCES, downloadSource } from "../src/lib/trail-sources";

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
for (const src of SOURCES) {
  const fc = await downloadSource(src);
  const out = new URL(`../data/${src.file}`, import.meta.url);
  await writeFile(out, JSON.stringify(fc));
  console.log(`${src.id}: saved ${fc.features.length} trails to ${out.pathname}`);
}
