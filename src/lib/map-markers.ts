// One marker point per walked route: the middle of its longest walked stretch. Used so
// that short walked sections are still visible on country-wide maps (web map and PDF).

type Lines = number[][][];

function linesOf(g: GeoJSON.Geometry | null): Lines {
  if (!g) return [];
  if (g.type === "LineString") return [g.coordinates as number[][]];
  if (g.type === "MultiLineString") return g.coordinates as Lines;
  return [];
}

export function walkedMarkers(covered: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const f of covered.features) {
    const lines = linesOf(f.geometry).filter((l) => l.length > 0);
    if (!lines.length) continue;
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
    const p = longest[Math.floor(longest.length / 2)];
    features.push({ type: "Feature", properties: f.properties ?? {}, geometry: { type: "Point", coordinates: [p[0], p[1]] } });
  }
  return { type: "FeatureCollection", features };
}
