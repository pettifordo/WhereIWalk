"use client";

// Builds a shareable 2-3 page PDF "brag sheet" in the browser: a clean map of the UK
// with your walked routes and tracks, all your stats, and progress per route group.
// The list of individual walks is optional.
import { useState } from "react";
import type { Stats } from "@/lib/stats"; // type only: the stats module uses the database

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (m: number) => MONTHS[m - 1];

type RGB = [number, number, number];
const GREEN: RGB = [47, 125, 79];
const GREEN_SOFT: RGB = [216, 236, 223];
const INK: RGB = [31, 42, 36];
const MUTED: RGB = [93, 107, 99];
const PAPER: RGB = [247, 246, 242];
const LINE: RGB = [220, 220, 212];

/** The PDF's built-in fonts only cover Latin-1, so turn e.g. "ŵ" into "w" and dashes into "-". */
const t = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/≈/g, "~")
    .replace(/[^\u0000-ÿ]/g, (c) => c.normalize("NFKD").replace(/[^\u0000-ÿ]/g, "") || "?");

const km = (m: number) => (m / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 });
const kmv = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: v < 10 ? 1 : 0 });
const pctNum = (a: number, b: number) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);
const pct = (a: number, b: number) => `${pctNum(a, b).toFixed(1)}%`;
const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";
const coord = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(3)}${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}${lon >= 0 ? "E" : "W"}`;
const plural = (n: number, w: string) => `${n.toLocaleString("en-GB")} ${w}${n === 1 ? "" : "s"}`;

/** autoTable: give header cells the same horizontal alignment as their column. */
const alignHeads = (cols: Record<number, "right">) =>
  (d: { section: string; column: { index: number }; cell: { styles: { halign?: string } } }) => {
    if (d.section === "head" && cols[d.column.index]) d.cell.styles.halign = cols[d.column.index];
  };

interface MapData { trails: GeoJSON.FeatureCollection; covered: GeoJSON.FeatureCollection; tracks: GeoJSON.FeatureCollection }
interface Walk { id: number; name: string | null; start_time: string | null; distance_m: number; route_m: number }

// Map: drawn directly on a canvas from our own data, on a plain UK outline
// (Natural Earth, public domain). No base-map tiles, so it's clean and UK-only.
const UK_BOUNDS = { minLon: -8.7, maxLon: 1.85, minLat: 49.85, maxLat: 60.9 };
const KX = Math.cos((55 * Math.PI) / 180); // squash longitude so the UK isn't stretched

function linesOf(g: GeoJSON.Geometry | null): number[][][] {
  if (!g) return [];
  if (g.type === "LineString") return [g.coordinates as number[][]];
  if (g.type === "MultiLineString") return g.coordinates as number[][][];
  return [];
}

async function drawUkMap(data: MapData, widthPx: number): Promise<{ url: string; aspect: number }> {
  const outline = (await import("@/lib/uk-outline.json")).default as unknown as { coordinates: number[][][][] };
  const w = (UK_BOUNDS.maxLon - UK_BOUNDS.minLon) * KX;
  const h = UK_BOUNDS.maxLat - UK_BOUNDS.minLat;
  const aspect = h / w;
  const W = widthPx;
  const H = Math.round(widthPx * aspect);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const sx = W / w;
  const px = (lon: number, lat: number): [number, number] => [(lon - UK_BOUNDS.minLon) * KX * sx, (UK_BOUNDS.maxLat - lat) * sx];
  const s = W / 1000; // line widths scale with output size

  ctx.fillStyle = "#eaf2f7"; // sea
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f4f1e8"; // land
  ctx.strokeStyle = "#a9b8ad";
  ctx.lineWidth = 0.8 * s;
  for (const poly of outline.coordinates) {
    ctx.beginPath();
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = px(lon, lat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fill("evenodd");
    ctx.stroke();
  }

  const stroke = (fc: GeoJSON.FeatureCollection, colour: string, width: number, alpha = 1) => {
    ctx.strokeStyle = colour;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width * s;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const f of fc.features) {
      for (const line of linesOf(f.geometry)) {
        ctx.beginPath();
        line.forEach(([lon, lat], i) => {
          const [x, y] = px(lon, lat);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };
  stroke(data.trails, "#d4995f", 1.4, 0.9); // all routes
  stroke(data.tracks, "#2f6fb5", 1.6, 0.75); // your tracks
  stroke(data.covered, "#1f8a4c", 6); // walked sections of routes
  return { url: canvas.toDataURL("image/png"), aspect };
}

type Doc = InstanceType<typeof import("jspdf").jsPDF>;

function sectionTitle(doc: Doc, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...GREEN);
  doc.text(t(text), x, y);
}

/** Simple single-series bar chart. */
function barChart(doc: Doc, x: number, y: number, w: number, h: number, title: string, bars: { label: string; value: number }[]) {
  sectionTitle(doc, title, x, y);
  const top = y + 4;
  const plotH = h - 14;
  const max = Math.max(...bars.map((b) => b.value), 0);
  const gap = 1.2;
  const bw = Math.min((w - gap * (bars.length - 1)) / bars.length, 12);
  const x0 = x + (w - (bw * bars.length + gap * (bars.length - 1))) / 2; // centre narrow sets
  doc.setDrawColor(...LINE).setLineWidth(0.2);
  doc.line(x, top + plotH, x + w, top + plotH);
  bars.forEach((b, i) => {
    const bx = x0 + i * (bw + gap);
    const bh = max ? (b.value / max) * (plotH - 5) : 0;
    if (bh > 0) {
      const r = Math.min(1, bw / 4);
      doc.setFillColor(...GREEN);
      doc.roundedRect(bx, top + plotH - bh, bw, bh, r, r, "F");
      if (b.value === max || bars.length <= 8) {
        doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(...INK);
        doc.text(kmv(b.value), bx + bw / 2, top + plotH - bh - 1.2, { align: "center" });
      }
    }
    doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(...MUTED);
    doc.text(t(b.label), bx + bw / 2, top + plotH + 4, { align: "center" });
  });
}

/** Two-column key/value list. Returns the y after the list. */
function kvList(doc: Doc, x: number, y: number, w: number, rows: [string, string, string?][]): number {
  let yy = y;
  for (const [k, v, sub] of rows) {
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
    doc.text(t(k), x, yy);
    doc.setTextColor(...INK).setFont("helvetica", "bold");
    doc.text(t(v), x + w, yy, { align: "right" });
    if (sub) {
      yy += 3.6;
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED);
      doc.text(t(sub), x + w, yy, { align: "right", maxWidth: w * 0.7 });
    }
    yy += 2.2;
    doc.setDrawColor(...LINE).setLineWidth(0.15);
    doc.line(x, yy, x + w, yy);
    yy += 4.4;
  }
  return yy;
}

async function buildPdf(stats: Stats, name: string, includeWalks: boolean, setStep: (s: string) => void) {
  setStep("Fetching your routes…");
  const [mapRes, walksRes] = await Promise.all([fetch("/api/map"), includeWalks ? fetch("/api/activities") : null]);
  if (!mapRes.ok || (walksRes && !walksRes.ok)) throw new Error("Couldn't load your data");
  const data = (await mapRes.json()) as MapData;
  const walks = walksRes ? ((await walksRes.json()) as Walk[]) : [];

  setStep("Drawing the map…");
  const map = await drawUkMap(data, 1600);

  setStep("Writing the PDF…");
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const firstName = name.split(/[ @]/)[0];

  // Page 1: headline numbers, UK map, progress by route type
  doc.setFillColor(...GREEN).rect(0, 0, W, 26, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(19);
  doc.text(t(`${name}'s walking record`), M, 12.5);
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  doc.text(t(`WhereIWalk · ${today} · walking since ${day(stats.firstWalk)}`), M, 20);

  const tiles: [string, string][] = [
    [`${kmv(stats.totalKm)} km`, `walked in total (${kmv(stats.totalKm / 1.609344)} miles)`],
    [stats.walks.toLocaleString("en-GB"), `walks, averaging ${kmv(stats.averageKm)} km`],
    [`${kmv(stats.routeKmUnique)} km`, "walked on routes (overlaps once)"],
    [`${stats.routesStarted}`, `routes started, ${stats.routesCompleted.length} completed`],
  ];
  const tw = (W - 2 * M - 9) / 4;
  tiles.forEach(([v, k], i) => {
    const x = M + i * (tw + 3);
    doc.setDrawColor(...LINE).setFillColor(...PAPER).roundedRect(x, 31, tw, 19, 2, 2, "FD");
    doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(15);
    doc.text(t(v), x + 3, 40);
    doc.setTextColor(...MUTED).setFont("helvetica", "normal").setFontSize(7.2);
    doc.text(t(k), x + 3, 46, { maxWidth: tw - 5 });
  });

  const mapW = 112;
  const mapH = mapW * map.aspect;
  const mapY = 55;
  doc.addImage(map.url, "PNG", M, mapY, mapW, mapH);
  doc.setDrawColor(...LINE).setLineWidth(0.2).rect(M, mapY, mapW, mapH);
  const ly = mapY + mapH + 4;
  const legend: [RGB, string, number][] = [
    [[31, 138, 76], "Routes walked", 1.2], [[212, 153, 95], "Routes not yet walked", 0.5], [[47, 111, 181], "Your tracks", 0.6],
  ];
  let lx = M;
  for (const [c, label, lw] of legend) {
    doc.setDrawColor(...c).setLineWidth(lw).line(lx, ly - 1, lx + 6, ly - 1);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED).text(label, lx + 7.5, ly);
    lx += 9 + doc.getTextWidth(label) + 4;
  }

  const rx = M + mapW + 7;
  const rw = W - M - rx;
  sectionTitle(doc, "Progress by type of route", rx, mapY + 4);
  let ry = mapY + 11;
  for (const g of stats.groups) {
    doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...INK).text(t(g.title), rx, ry);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(t(`${km(g.covered_m)} of ${km(g.length_m)} km · ${g.started}/${g.count} started`), rx, ry + 4.5);
    doc.setFillColor(...GREEN_SOFT).roundedRect(rx, ry + 6.5, rw, 2.4, 1.2, 1.2, "F");
    const fw = (rw * pctNum(g.covered_m, g.length_m)) / 100;
    if (fw > 0) doc.setFillColor(...GREEN).roundedRect(rx, ry + 6.5, Math.max(fw, 2.4), 2.4, 1.2, 1.2, "F");
    ry += 15;
  }
  const top = stats.groups
    .flatMap((g) => [...g.trails, ...g.series.flatMap((s) => s.trails)])
    .filter((r) => r.covered_m > 0)
    .sort((a, b) => b.covered_m / b.length_m - a.covered_m / a.length_m)
    .slice(0, 8);
  if (top.length) {
    ry += 3;
    sectionTitle(doc, "Most complete routes", rx, ry);
    ry += 6;
    for (const r of top) {
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...INK).text(t(r.name), rx, ry, { maxWidth: rw - 14 });
      doc.setFont("helvetica", "bold").text(pct(r.covered_m, r.length_m), rx + rw, ry, { align: "right" });
      doc.setFont("helvetica", "normal").setFontSize(6.8).setTextColor(...MUTED).text(`${km(r.covered_m)} / ${km(r.length_m)} km`, rx, ry + 3.4);
      ry += 8;
    }
  }
  if (stats.routesCompleted.length) {
    ry += 2;
    sectionTitle(doc, "Completed", rx, ry);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...INK);
    doc.text(t(stats.routesCompleted.map((r) => r.name).join(", ")), rx, ry + 5, { maxWidth: rw });
  }

  // Page 2: all the stats, then route-by-route progress
  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...INK).text(t(`${firstName}'s walking in numbers`), M, 18);
  const colW = (W - 2 * M - 8) / 2;
  barChart(doc, M, 30, colW, 52, "Distance by year (km)", stats.byYear.map((y) => ({ label: String(y.year), value: y.km })));
  barChart(doc, M + colW + 8, 30, colW, 52, "Distance by month, all years (km)", stats.byMonth.map((m) => ({ label: monthName(m.month), value: m.km })));

  sectionTitle(doc, "Records", M, 92);
  const records: [string, string, string?][] = [];
  if (stats.longestWalk) records.push(["Longest walk", `${kmv(stats.longestWalk.km)} km`, `${stats.longestWalk.name ?? "Untitled"}, ${day(stats.longestWalk.date)}`]);
  if (stats.bestMonth) records.push(["Best month", `${kmv(stats.bestMonth.km)} km`, stats.bestMonth.label]);
  records.push(["Longest streak", plural(stats.longestStreakDays, "day") + " in a row"]);
  records.push(["Days out walking", stats.daysWalked.toLocaleString("en-GB")]);
  records.push(["OS 10 km grid squares visited", stats.gridSquares.toLocaleString("en-GB")]);
  records.push(["Average walk", `${kmv(stats.averageKm)} km`]);
  if (stats.mostWalkedRoute) records.push(["Most-walked route", `${km(stats.mostWalkedRoute.covered_m)} km`, stats.mostWalkedRoute.name]);
  records.push(["First walk", day(stats.firstWalk)]);
  records.push(["Most recent walk", day(stats.lastWalk)]);
  const afterRecords = kvList(doc, M, 99, colW, records);

  const cx = M + colW + 8;
  sectionTitle(doc, "Compass points", cx, 92);
  const afterCompass = kvList(doc, cx, 99, colW,
    stats.extremes.map((e) => [`Furthest ${e.label.toLowerCase()}`, coord(e.lat, e.lon), `${e.walk ?? "Untitled"}, ${day(e.date)}`] as [string, string, string]));
  sectionTitle(doc, "Activity types", cx, afterCompass + 4);
  const afterTypes = kvList(doc, cx, afterCompass + 11, colW,
    stats.byType.map((x) => [x.type, `${kmv(x.km)} km`, plural(x.walks, "walk")] as [string, string, string]));

  let y = Math.max(afterRecords, afterTypes) + 4;
  if (y > H - 40) { doc.addPage(); y = 18; }
  sectionTitle(doc, "Progress on each route walked", M, y);
  y += 2;
  for (const g of stats.groups) {
    const rows: string[][] = [];
    for (const r of g.trails.filter((x) => x.covered_m > 0)) rows.push([t(r.name), km(r.covered_m), km(r.length_m), pct(r.covered_m, r.length_m)]);
    for (const s of g.series.filter((x) => x.covered_m > 0)) {
      rows.push([t(s.name), km(s.covered_m), km(s.length_m), pct(s.covered_m, s.length_m)]);
      for (const r of s.trails.filter((x) => x.covered_m > 0)) rows.push([`   ${t(r.name)}`, km(r.covered_m), km(r.length_m), pct(r.covered_m, r.length_m)]);
    }
    if (!rows.length) continue;
    autoTable(doc, {
      startY: y + 2, margin: { left: M, right: M },
      head: [[t(g.title), "Walked km", "Length km", "Done"]], body: rows,
      styles: { fontSize: 8.5, textColor: INK, cellPadding: 1.3 },
      headStyles: { fillColor: GREEN, textColor: 255 },
      columnStyles: { 1: { halign: "right", cellWidth: 24 }, 2: { halign: "right", cellWidth: 24 }, 3: { halign: "right", cellWidth: 18 } },
      alternateRowStyles: { fillColor: PAPER },
      didParseCell: alignHeads({ 1: "right", 2: "right", 3: "right" }),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  // Optional: list of walks
  if (includeWalks && walks.length) {
    doc.addPage();
    doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(16).text(t(`Walks (${walks.length})`), M, 18);
    autoTable(doc, {
      startY: 24, margin: { left: M, right: M },
      head: [["Date", "Walk", "Distance km", "On routes km"]],
      body: walks.map((w) => [day(w.start_time), t(w.name) || "Untitled", km(w.distance_m), w.route_m > 50 ? km(w.route_m) : "-"]),
      styles: { fontSize: 8, textColor: INK, cellPadding: 1.2 }, headStyles: { fillColor: GREEN, textColor: 255 },
      columnStyles: { 0: { cellWidth: 26 }, 2: { halign: "right", cellWidth: 24 }, 3: { halign: "right", cellWidth: 26 } },
      alternateRowStyles: { fillColor: PAPER },
      didParseCell: alignHeads({ 2: "right", 3: "right" }),
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5).setTextColor(...MUTED).setFont("helvetica", "normal");
    doc.text(t(`WhereIWalk · whereiwalk.vercel.app · Routes: Natural England & Natural Resources Wales (Open Government Licence) · UK outline: Natural Earth · page ${i} of ${pages}`), M, H - 7);
  }

  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "walker";
  doc.save(`whereiwalk-${safe}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function BragSheetButton({ stats, name }: { stats: Stats; name: string }) {
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeWalks, setIncludeWalks] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {error && <span className="error small">{error}</span>}
      {step && <span className="muted small">{step}</span>}
      <label className="small muted" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={includeWalks} onChange={(e) => setIncludeWalks(e.target.checked)} /> Include list of walks
      </label>
      <button
        className="primary"
        disabled={!!step}
        onClick={async () => {
          setError(null);
          try {
            await buildPdf(stats, name, includeWalks, setStep);
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
