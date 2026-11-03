import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import { FitBaseType, FitEncoder } from "fit-file-parser";
import { simplify, splitOnGaps, lineLengthM, type LonLat } from "../src/lib/parse/geo";
import { parseCsv, parseFit, parseGpx, parseStravaExport } from "../src/lib/parse/index";

const DP = DOMParser as unknown as Parameters<typeof parseGpx>[1];

function gpx(points: LonLat[], opts: { name?: string; type?: string; time?: string } = {}): string {
  const pts = points
    .map(([lon, lat], i) =>
      `<trkpt lat="${lat}" lon="${lon}">${opts.time && i === 0 ? `<time>${opts.time}</time>` : ""}</trkpt>`,
    )
    .join("");
  return `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
    <trk>${opts.name ? `<name>${opts.name}</name>` : ""}${opts.type ? `<type>${opts.type}</type>` : ""}
    <trkseg>${pts}</trkseg></trk></gpx>`;
}

/** A straight 1 km-ish line near Edale, one point every ~10 m. */
const edale: LonLat[] = Array.from({ length: 100 }, (_, i) => [-1.8167 + i * 0.00015, 53.3667]);

describe("geo helpers", () => {
  test("simplify keeps ends and removes collinear points", () => {
    const s = simplify(edale, 5);
    assert.equal(s.length, 2);
    assert.deepEqual(s[0], edale[0]);
    assert.deepEqual(s[1], edale[edale.length - 1]);
  });

  test("simplify keeps a real corner", () => {
    const corner: LonLat[] = [[0, 51], [0.001, 51], [0.002, 51], [0.002, 51.001], [0.002, 51.002]];
    assert.equal(simplify(corner, 5).length, 3);
  });

  test("splitOnGaps splits at big jumps", () => {
    const parts = splitOnGaps([...edale.slice(0, 10), ...edale.slice(10).map(([x, y]) => [x + 0.02, y] as LonLat)]);
    assert.equal(parts.length, 2);
  });

  test("line length is about right", () => {
    const d = lineLengthM(edale);
    assert.ok(d > 950 && d < 1050, `got ${d}`);
  });
});

describe("file parsing", () => {
  test("GPX with name, type and time", () => {
    const a = parseGpx(gpx(edale, { name: "Kinder loop", type: "hiking", time: "2026-04-05T08:30:00Z" }), DP);
    assert.ok(a);
    assert.equal(a.name, "Kinder loop");
    assert.equal(a.type, "hiking");
    assert.equal(a.startTime, "2026-04-05T08:30:00.000Z");
    assert.equal(a.lines.length, 1);
    assert.equal(a.lines[0].length, 2, "simplified");
    assert.match(a.fingerprint, /^t:2026-04-05T08:30:/);
  });

  test("tracks outside Great Britain are ignored", () => {
    const paris: LonLat[] = edale.map(([x, y]) => [x + 4.17, y - 4.5]);
    assert.equal(parseGpx(gpx(paris), DP), null);
  });

  test("CSV parser handles quotes and commas", () => {
    const rows = parseCsv('a,b\n"x, y","he said ""hi"""\n');
    assert.deepEqual(rows, [["a", "b"], ["x, y", 'he said "hi"']]);
  });

  test("Strava export ZIP: uses names/types from activities.csv and reads .gz files", async () => {
    const zip = new JSZip();
    zip.file(
      "activities.csv",
      'Activity ID,Activity Date,Activity Name,Activity Type,Filename\n1,"Apr 5, 2026",Edale walk,Hike,activities/1.gpx.gz\n2,"Apr 6, 2026",Gym,Workout,\n',
    );
    const gz = new Uint8Array(
      await new Response(new Blob([gpx(edale, { time: "2026-04-05T08:30:00Z" })]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer(),
    );
    zip.file("activities/1.gpx.gz", gz);
    const data = await zip.generateAsync({ type: "uint8array" });
    const res = await parseStravaExport(data, undefined, DP);
    assert.equal(res.issues.length, 0);
    assert.equal(res.activities.length, 1);
    assert.equal(res.activities[0].name, "Edale walk");
    assert.equal(res.activities[0].type, "Hike");
    assert.equal(res.activities[0].source, "strava-export");
  });

  test("FIT file: positions in semicircles become lon/lat, start time is read", async () => {
    const enc = new FitEncoder();
    const start = new Date("2026-06-01T07:00:00Z");
    const semi = (deg: number) => Math.round((deg * 2 ** 31) / 180);
    edale.forEach(([lon, lat], i) => {
      enc.writeMessage(20, [
        { number: 253, size: 4, baseType: FitBaseType.Uint32, value: FitEncoder.toFitTimestamp(new Date(start.getTime() + i * 5000)) },
        { number: 0, size: 4, baseType: FitBaseType.Sint32, value: semi(lat) },
        { number: 1, size: 4, baseType: FitBaseType.Sint32, value: semi(lon) },
      ]);
    });
    const bytes = enc.close();
    const a = await parseFit(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    assert.ok(a);
    assert.equal(a.startTime, start.toISOString());
    assert.ok(Math.abs(a.lines[0][0][0] - edale[0][0]) < 1e-5);
    assert.ok(Math.abs(a.lines[0][0][1] - edale[0][1]) < 1e-5);
    assert.ok(a.distanceM > 950 && a.distanceM < 1050);
  });
});
