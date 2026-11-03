// MapLibre GL 6 loads its web worker from a separate file that Next.js doesn't
// bundle. Copy it into public/ so it is served at /maplibre/maplibre-gl-worker.mjs
// (see src/components/MapCanvas.tsx). Runs on install, dev and build.
import { copyFile, mkdir } from "node:fs/promises";

const src = new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url);
const dir = new URL("../public/maplibre/", import.meta.url);
await mkdir(dir, { recursive: true });
await copyFile(src, new URL("maplibre-gl-worker.mjs", dir));
