// Downloads the National Trails (England) dataset from Natural England's ArcGIS
// feature service and saves it as GeoJSON in data/.
//
// Licence: Open Government Licence v3.0.
// Attribution (from the service): "© Natural England copyright. Contains Ordnance
// Survey data © Crown copyright and database right [year]."
import { mkdir, writeFile } from "node:fs/promises";

const SERVICE =
  "https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/National_Trails_England/FeatureServer/0/query";

const params = new URLSearchParams({
  where: "1=1",
  outFields: "Name,Start,End_,Length_Km",
  outSR: "4326",
  f: "geojson",
});

const res = await fetch(`${SERVICE}?${params}`);
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
const geojson = (await res.json()) as { features?: unknown[] };
if (!geojson.features?.length) throw new Error("No features returned");

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
const out = new URL("../data/national-trails-england.geojson", import.meta.url);
await writeFile(out, JSON.stringify(geojson));
console.log(`Saved ${geojson.features.length} trails to ${out.pathname}`);
