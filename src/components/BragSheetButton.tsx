"use client";

// Builds a shareable PDF "brag sheet" in the browser: a map of your walked routes and
// tracks, headline stats, progress per route group, records, and a list of walks.
import { useState } from "react";
import type { Stats } from "@/lib/stats";

const GREEN: [number, number, number] = [47, 125, 79];
const INK: [number, number, number] = [31, 42, 36];
const MUTED: [number, number, number] = [93, 107, 99];

/** The PDF's built-in fonts only cover Latin-1, so turn e.g. "ŵ" into "w" and dashes into "-". */
const t = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/≈/g, "~")
    .replace(/[^\u0000-ÿ]/g, (c) => c.normalize("NFKD").replace(/[^\u0000-ÿ]/g, "") || "?");

const km = (m: number) => (m / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 });
/** autoTable: give header cells the same horizontal alignment as their column. */
const alignHeads = (cols: Record<number, "right">) => (d: { section: string; column: { index: number }; cell: { styles: { halign?: string } } }) => {
  if (d.section === "head" && cols[d.column.index]) d.cell.styles.halign = cols[d.column.index];
};
const kmv = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: v < 10 ? 1 : 0 });
const pct = (a: number, b: number) => (b > 0 ? `${Math.min(100, (a / b) * 100).toFixed(1)}%` : "0%");
const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";

interface MapData { trails: GeoJSON.FeatureCollection; covered: GeoJSON.FeatureCollection; tracks: GeoJSON.FeatureCollection }
interface Walk { id: number; name: string | null; start_time: string | null; distance_m: number; route_m: number }

/** Bounding box of all coordinates in some feature collections. */
function bboxOf(...fcs: GeoJSON.FeatureCollection[]): [number, number, number, number] | null {
  let b: [number, number, number, number] | null = null;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      b = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y];
    } else if (Array.isArray(c)) c.forEach(visit);
  };
  for (const fc of fcs) for (const f of fc.features) if (f.geometry && "coordinates" in f.geometry) visit(f.geometry.coordinates);
  return b;
}

/** Render the map off-screen and return it as a JPEG data URL. */
async function renderMap(data: MapData, widthPx: number, heightPx: number): Promise<string | null> {
  const maplibregl = await import("maplibre-gl");
  const { BASEMAP_STYLE, UK_BOUNDS } = await import("./MapCanvas");
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  const el = document.createElement("div");
  Object.assign(el.style, { position: "fixed", left: "-10000px", top: "0", width: `${widthPx}px`, height: `${heightPx}px` });
  document.body.appendChild(el);
  const walked = bboxOf(data.covered, data.tracks);
  const bounds = walked ?? UK_BOUNDS;
  const map = new maplibregl.Map({
    container: el,
    style: BASEMAP_STYLE,
    bounds,
    fitBoundsOptions: { padding: 60, maxZoom: 11 },
    attributionControl: false,
    interactive: false,
    pixelRatio: 2,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("map timed out")), 25_000);
      map.on("error", () => {});
      map.on("load", () => {
        map.addSource("trails", { type: "geojson", data: data.trails });
        map.addSource("tracks", { type: "geojson", data: data.tracks });
        map.addSource("covered", { type: "geojson", data: data.covered });
        map.addLayer({ id: "tracks", type: "line", source: "tracks", paint: { "line-color": "#2f6fb5", "line-width": 2.5, "line-opacity": 0.8 } });
        map.addLayer({ id: "trails", type: "line", source: "trails", paint: { "line-color": "#c0702a", "line-width": 1.5, "line-opacity": 0.7 } });
        map.addLayer({ id: "covered", type: "line", source: "covered", layout: { "line-cap": "round" }, paint: { "line-color": "#1f8a4c", "line-width": 7 } });
        map.once("idle", () => { clearTimeout(timer); resolve(); });
      });
    });
    return map.getCanvas().toDataURL("image/jpeg", 0.85);
  } catch {
    return null; // the PDF is still useful without the map
  } finally {
    map.remove();
    el.remove();
  }
}

async function buildPdf(stats: Stats, name: string, setStep: (s: string) => void) {
  setStep("Fetching your routes…");
  const [mapRes, walksRes] = await Promise.all([fetch("/api/map"), fetch("/api/activities")]);
  if (!mapRes.ok || !walksRes.ok) throw new Error("Couldn't load your data");
  const data = (await mapRes.json()) as MapData;
  const walks = (await walksRes.json()) as Walk[];

  setStep("Drawing the map…");
  const mapImg = await renderMap(data, 1100, 820);

  setStep("Writing the PDF…");
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // Header band
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(20);
  doc.text(t(`${name}'s walking record`), M, 14);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(t(`WhereIWalk · ${today} · walking since ${day(stats.firstWalk)}`), M, 22);

  // Headline numbers
  const tiles: [string, string][] = [
    [`${kmv(stats.totalKm)} km`, "walked in total"],
    [stats.walks.toLocaleString("en-GB"), "walks"],
    [`${kmv(stats.routeKmUnique)} km`, "of routes walked"],
    [`${stats.routesStarted} / ${stats.routesCompleted.length}`, "routes started / completed"],
  ];
  const tw = (W - 2 * M - 9) / 4;
  tiles.forEach(([v, k], i) => {
    const x = M + i * (tw + 3);
    doc.setDrawColor(220, 220, 212).setFillColor(247, 246, 242);
    doc.roundedRect(x, 36, tw, 20, 2, 2, "FD");
    doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(14);
    doc.text(t(v), x + 3, 45);
    doc.setTextColor(...MUTED).setFont("helvetica", "normal").setFontSize(8);
    doc.text(t(k), x + 3, 51);
  });

  // Map
  let y = 62;
  if (mapImg) {
    const mh = (W - 2 * M) * (820 / 1100);
    doc.addImage(mapImg, "JPEG", M, y, W - 2 * M, mh);
    y += mh + 4;
    doc.setFontSize(7).setTextColor(...MUTED);
    doc.text(t("Green: routes walked · Orange: routes not yet walked · Blue: your tracks. Map © OpenFreeMap © OpenMapTiles © OpenStreetMap contributors."), M, y);
    y += 6;
  }

  // Records
  const records: [string, string][] = [];
  if (stats.longestWalk) records.push(["Longest walk", `${kmv(stats.longestWalk.km)} km - ${t(stats.longestWalk.name) || "Untitled"} (${day(stats.longestWalk.date)})`]);
  if (stats.bestMonth) records.push(["Best month", `${stats.bestMonth.label} - ${kmv(stats.bestMonth.km)} km`]);
  records.push(["Longest streak", `${stats.longestStreakDays} day${stats.longestStreakDays === 1 ? "" : "s"} in a row`]);
  records.push(["Days out walking", stats.daysWalked.toLocaleString("en-GB")]);
  records.push(["OS 10 km grid squares visited", stats.gridSquares.toLocaleString("en-GB")]);
  for (const e of stats.extremes) records.push([`Furthest ${e.label.toLowerCase()}`, `${t(e.walk) || "Untitled"} (${day(e.date)})`]);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, head: [["Records", ""]], body: records,
    theme: "plain", styles: { fontSize: 9, textColor: INK, cellPadding: 1.4 },
    headStyles: { fontStyle: "bold", textColor: GREEN, fontSize: 11 },
    columnStyles: { 0: { cellWidth: 60, textColor: MUTED } },
  });

  // Progress per group (walked routes only, with group totals)
  doc.addPage();
  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(16);
  doc.text("Progress on routes", M, 20);
  y = 26;
  for (const g of stats.groups) {
    const rows: string[][] = [];
    for (const r of g.trails.filter((x) => x.covered_m > 0)) rows.push([t(r.name), km(r.covered_m), km(r.length_m), pct(r.covered_m, r.length_m)]);
    for (const s of g.series.filter((x) => x.covered_m > 0)) {
      rows.push([t(s.name), km(s.covered_m), km(s.length_m), pct(s.covered_m, s.length_m)]);
      for (const r of s.trails.filter((x) => x.covered_m > 0)) rows.push([`   ${t(r.name)}`, km(r.covered_m), km(r.length_m), pct(r.covered_m, r.length_m)]);
    }
    if (!rows.length) rows.push(["Nothing walked yet", "", "", ""]);
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [[t(`${g.title} - ${km(g.covered_m)} of ${km(g.length_m)} km, ${g.started}/${g.count} started`), "Walked km", "Length km", "Done"]],
      body: rows,
      styles: { fontSize: 9, textColor: INK },
      headStyles: { fillColor: GREEN, textColor: 255 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      alternateRowStyles: { fillColor: [247, 246, 242] },
      didParseCell: alignHeads({ 1: "right", 2: "right", 3: "right" }),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // By year
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, head: [["Year", "Walks", "Distance km"]],
    body: stats.byYear.map((r) => [String(r.year), String(r.walks), kmv(r.km)]),
    styles: { fontSize: 9, textColor: INK }, headStyles: { fillColor: GREEN, textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    didParseCell: alignHeads({ 1: "right", 2: "right" }),
  });

  // Walks
  doc.addPage();
  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(16);
  doc.text(t(`Walks (${walks.length})`), M, 20);
  autoTable(doc, {
    startY: 26, margin: { left: M, right: M },
    head: [["Date", "Walk", "Distance km", "On routes km"]],
    body: walks.map((w) => [day(w.start_time), t(w.name) || "Untitled", km(w.distance_m), w.route_m > 50 ? km(w.route_m) : "-"]),
    styles: { fontSize: 8.5, textColor: INK }, headStyles: { fillColor: GREEN, textColor: 255 },
    columnStyles: { 0: { cellWidth: 28 }, 2: { halign: "right", cellWidth: 24 }, 3: { halign: "right", cellWidth: 26 } },
    alternateRowStyles: { fillColor: [247, 246, 242] },
    didParseCell: alignHeads({ 2: "right", 3: "right" }),
  });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setTextColor(...MUTED).setFont("helvetica", "normal");
    doc.text(t(`WhereIWalk · whereiwalk.vercel.app · Route data: Natural England, Natural Resources Wales (OGL) · page ${i} of ${pages}`), M, 290);
  }

  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "walker";
  doc.save(`whereiwalk-${safe}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function BragSheetButton({ stats, name }: { stats: Stats; name: string }) {
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {error && <span className="error small">{error}</span>}
      {step && <span className="muted small">{step}</span>}
      <button
        className="primary"
        disabled={!!step}
        onClick={async () => {
          setError(null);
          try {
            await buildPdf(stats, name, setStep);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setStep(null);
          }
        }}
      >
        Download brag sheet (PDF)
      </button>
    </div>
  );
}
