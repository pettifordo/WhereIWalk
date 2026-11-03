// Turns activity files (GPX, TCX, FIT, optionally gzipped, or a whole Strava
// bulk-export ZIP) into simplified tracks ready to upload. Runs in the browser,
// so raw files never leave the user's device.
import { gpx as gpxToGeoJSON, tcx as tcxToGeoJSON } from "@tmcw/togeojson";
import FitParser from "fit-file-parser";
import JSZip from "jszip";
import {
  type LonLat,
  isValidLonLat,
  lineLengthM,
  simplify,
  splitOnGaps,
  touchesGB,
} from "./geo";

export type ActivitySource = "strava-export" | "gpx" | "tcx" | "fit";

export interface ParsedActivity {
  source: ActivitySource;
  name: string | null;
  type: string | null;
  startTime: string | null;
  distanceM: number;
  /** Simplified lines (lon/lat). Several lines if the recording had gaps. */
  lines: LonLat[][];
  fingerprint: string;
}

export interface ParseIssue {
  file: string;
  reason: string;
}

/** Simplification tolerance: well under GPS error, but cuts points ~10x. */
export const SIMPLIFY_TOLERANCE_M = 5;

type DOMParserCtor = new () => { parseFromString(s: string, type: string): unknown };

function getDOMParser(override?: DOMParserCtor): DOMParserCtor {
  const impl = override ?? (globalThis as { DOMParser?: DOMParserCtor }).DOMParser;
  if (!impl) throw new Error("No DOMParser available");
  return impl;
}

function finish(
  source: ActivitySource,
  rawLines: LonLat[][],
  meta: { name?: string | null; type?: string | null; startTime?: string | null },
): ParsedActivity | null {
  const cleaned = rawLines
    .map((l) => l.filter(isValidLonLat))
    .flatMap((l) => splitOnGaps(l));
  if (cleaned.length === 0 || !touchesGB(cleaned)) return null;
  const distanceM = cleaned.reduce((s, l) => s + lineLengthM(l), 0);
  if (distanceM < 50) return null;
  const lines = cleaned
    .map((l) => simplify(l, SIMPLIFY_TOLERANCE_M).map(([x, y]) => [round6(x), round6(y)] as LonLat))
    .filter((l) => l.length >= 2);
  const startTime = meta.startTime ? new Date(meta.startTime).toISOString() : null;
  const first = cleaned[0][0];
  const fingerprint = startTime
    ? `t:${startTime.slice(0, 16)}:${Math.round(distanceM / 100)}`
    : `p:${round4(first[0])},${round4(first[1])}:${Math.round(distanceM / 100)}`;
  return {
    source,
    name: meta.name?.trim() || null,
    type: meta.type?.trim() || null,
    startTime,
    distanceM,
    lines,
    fingerprint,
  };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

interface GJFeature {
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> | null;
}

function linesFromFeatures(features: GJFeature[]): LonLat[][] {
  const lines: LonLat[][] = [];
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "LineString") lines.push((g.coordinates as number[][]).map((c) => [c[0], c[1]]));
    if (g.type === "MultiLineString")
      for (const l of g.coordinates as number[][][]) lines.push(l.map((c) => [c[0], c[1]]));
  }
  return lines;
}

function firstTime(features: GJFeature[]): string | null {
  for (const f of features) {
    const p = f.properties ?? {};
    if (typeof p.time === "string") return p.time;
    const times = (p.coordinateProperties as { times?: unknown } | undefined)?.times;
    const flat = Array.isArray(times) ? (times.flat(2) as unknown[]) : [];
    const t = flat.find((x) => typeof x === "string");
    if (typeof t === "string") return t;
  }
  return null;
}

export function parseGpx(text: string, DOMParserImpl?: DOMParserCtor): ParsedActivity | null {
  const doc = new (getDOMParser(DOMParserImpl))().parseFromString(text.trim(), "text/xml");
  const fc = gpxToGeoJSON(doc as Document) as unknown as { features: GJFeature[] };
  const tracks = fc.features.filter((f) => f.geometry && f.geometry.type !== "Point");
  const props = tracks[0]?.properties ?? {};
  return finish("gpx", linesFromFeatures(tracks), {
    name: (props.name as string) ?? null,
    type: (props.type as string) ?? null,
    startTime: firstTime(tracks),
  });
}

export function parseTcx(text: string, DOMParserImpl?: DOMParserCtor): ParsedActivity | null {
  const doc = new (getDOMParser(DOMParserImpl))().parseFromString(text.trim(), "text/xml");
  const fc = tcxToGeoJSON(doc as Document) as unknown as { features: GJFeature[] };
  const tracks = fc.features.filter((f) => f.geometry && f.geometry.type !== "Point");
  const props = tracks[0]?.properties ?? {};
  return finish("tcx", linesFromFeatures(tracks), {
    name: (props.name as string) ?? null,
    type: (props.type as string) ?? null,
    startTime: firstTime(tracks),
  });
}

export async function parseFit(buf: ArrayBuffer): Promise<ParsedActivity | null> {
  const parser = new FitParser({ force: true, mode: "list", lengthUnit: "m" });
  const data = await parser.parseAsync(buf);
  const pts: LonLat[] = [];
  let start: string | null = null;
  for (const r of data.records ?? []) {
    let lat = r.position_lat;
    let lon = r.position_long;
    if (lat == null || lon == null) continue;
    // Some FIT decoders return raw semicircles rather than degrees.
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      lat = (lat * 180) / 2 ** 31;
      lon = (lon * 180) / 2 ** 31;
    }
    if (!start) {
      const ts = (r as { timestamp?: unknown }).timestamp;
      if (ts instanceof Date || typeof ts === "string") start = new Date(ts).toISOString();
    }
    pts.push([lon, lat]);
  }
  const sport = (data.sessions?.[0] as { sport?: unknown } | undefined)?.sport;
  return finish("fit", [pts], {
    type: typeof sport === "string" ? sport : null,
    startTime: start,
  });
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const decoder = new TextDecoder();

/** Parse a single activity file by name. Returns null if it has no usable GB track. */
export async function parseActivityFile(
  filename: string,
  bytes: Uint8Array,
  DOMParserImpl?: DOMParserCtor,
): Promise<ParsedActivity | null> {
  let name = filename.toLowerCase();
  if (name.endsWith(".gz")) {
    bytes = await gunzip(bytes);
    name = name.slice(0, -3);
  }
  if (name.endsWith(".gpx")) return parseGpx(decoder.decode(bytes), DOMParserImpl);
  if (name.endsWith(".tcx")) return parseTcx(decoder.decode(bytes), DOMParserImpl);
  if (name.endsWith(".fit")) {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return parseFit(ab);
  }
  throw new Error("Unsupported file type");
}

export function isActivityFile(filename: string): boolean {
  return /\.(gpx|tcx|fit)(\.gz)?$/i.test(filename);
}

/** Minimal RFC 4180 CSV parser (handles quotes, commas and newlines in fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

interface StravaMeta {
  name: string | null;
  type: string | null;
}

/** Read activities.csv from a Strava export: filename -> name/type. */
function readStravaCsv(text: string): Map<string, StravaMeta> {
  const rows = parseCsv(text);
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (n: string) => header.indexOf(n);
  const iFile = col("filename");
  const iName = col("activity name");
  const iType = col("activity type");
  const map = new Map<string, StravaMeta>();
  if (iFile < 0) return map;
  for (const r of rows.slice(1)) {
    const file = r[iFile]?.trim();
    if (!file) continue;
    map.set(file, { name: r[iName] ?? null, type: r[iType] ?? null });
  }
  return map;
}

export interface ParseProgress {
  done: number;
  total: number;
  current: string;
}

/** Parse a Strava bulk export ZIP. Activities without a GPS track in GB are skipped. */
export async function parseStravaExport(
  zipData: Blob | ArrayBuffer | Uint8Array,
  onProgress?: (p: ParseProgress) => void,
  DOMParserImpl?: DOMParserCtor,
): Promise<{ activities: ParsedActivity[]; skipped: number; issues: ParseIssue[] }> {
  const zip = await JSZip.loadAsync(zipData);
  const csvEntry = Object.values(zip.files).find((f) => /(^|\/)activities\.csv$/i.test(f.name));
  const meta = csvEntry ? readStravaCsv(await csvEntry.async("string")) : new Map<string, StravaMeta>();
  const entries = Object.values(zip.files).filter((f) => !f.dir && isActivityFile(f.name));
  const activities: ParsedActivity[] = [];
  const issues: ParseIssue[] = [];
  let skipped = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    onProgress?.({ done: i, total: entries.length, current: e.name });
    try {
      const a = await parseActivityFile(e.name, await e.async("uint8array"), DOMParserImpl);
      if (!a) {
        skipped++;
        continue;
      }
      // activities.csv paths look like "activities/123.gpx.gz"
      const key = e.name.replace(/^.*?(activities\/)/, "$1");
      const m = meta.get(key);
      activities.push({ ...a, source: "strava-export", name: m?.name || a.name, type: m?.type || a.type });
    } catch (err) {
      issues.push({ file: e.name, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  onProgress?.({ done: entries.length, total: entries.length, current: "" });
  return { activities, skipped, issues };
}
