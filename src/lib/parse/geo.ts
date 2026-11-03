export type LonLat = [number, number];

const R = 6371008.8; // mean Earth radius, metres

export function haversineM(a: LonLat, b: LonLat): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function lineLengthM(line: LonLat[]): number {
  let d = 0;
  for (let i = 1; i < line.length; i++) d += haversineM(line[i - 1], line[i]);
  return d;
}

/**
 * Douglas–Peucker simplification with a tolerance in metres. Uses a local
 * equirectangular projection, which is accurate enough over a single track.
 */
export function simplify(line: LonLat[], toleranceM: number): LonLat[] {
  if (line.length <= 2) return line.slice();
  const lat0 = (line[0][1] * Math.PI) / 180;
  const kx = (Math.PI / 180) * R * Math.cos(lat0);
  const ky = (Math.PI / 180) * R;
  const xy = line.map(([lon, lat]) => [lon * kx, lat * ky] as const);
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  const tol2 = toleranceM * toleranceM;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = xy[s];
    const [bx, by] = xy[e];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = xy[i];
      let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + t * dx - px;
      const qy = ay + t * dy - py;
      const d2 = qx * qx + qy * qy;
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Rough bounding box of Great Britain plus a margin (lon/lat). */
const GB_BOUNDS = { minLon: -9, maxLon: 2.5, minLat: 49.5, maxLat: 61.5 };

export function isValidLonLat(p: LonLat): boolean {
  return (
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90 &&
    !(p[0] === 0 && p[1] === 0)
  );
}

export function touchesGB(lines: LonLat[][]): boolean {
  return lines.some((l) =>
    l.some(
      ([lon, lat]) =>
        lon >= GB_BOUNDS.minLon &&
        lon <= GB_BOUNDS.maxLon &&
        lat >= GB_BOUNDS.minLat &&
        lat <= GB_BOUNDS.maxLat,
    ),
  );
}

/**
 * Split a line wherever consecutive points are further apart than maxGapM
 * (e.g. GPS dropouts), so gaps are never bridged with a straight line.
 */
export function splitOnGaps(line: LonLat[], maxGapM = 500): LonLat[][] {
  const out: LonLat[][] = [];
  let cur: LonLat[] = [];
  for (const p of line) {
    if (cur.length && haversineM(cur[cur.length - 1], p) > maxGapM) {
      if (cur.length >= 2) out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}
