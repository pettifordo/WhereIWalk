"use client";

import { useCallback, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import MapCanvas, { type BBox } from "./MapCanvas";
import { COLOURS } from "./OverviewMap";
import type { TrailDetail } from "@/lib/queries";
import { km } from "@/lib/format";

/** Gaps shorter than this are hidden from the list (still shown on the map). */
const MIN_GAP_M = 300;

export default function TrailExplorer({ detail }: { detail: TrailDetail }) {
  const mapRef = useRef<maplibregl.Map | null>(null);

  const onReady = useCallback(
    (m: maplibregl.Map) => {
      mapRef.current = m;
      m.addSource("runs", { type: "geojson", data: detail.geojson as GeoJSON.FeatureCollection });
      m.addLayer({
        id: "runs", type: "line", source: "runs",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["case", ["get", "covered"], COLOURS.covered, COLOURS.trail],
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 3, 14, 7],
        },
      });
      m.addLayer({
        id: "highlight", type: "line", source: "runs",
        filter: ["==", ["get", "run"], -1],
        paint: { "line-color": "#ffd400", "line-width": 12, "line-opacity": 0.6 },
      }, "runs");
    },
    [detail],
  );

  const gaps = detail.runs
    .map((r, i) => ({ ...r, index: i }))
    .filter((r) => !r.covered && r.length_m >= MIN_GAP_M)
    .sort((a, b) => b.length_m - a.length_m);

  const multiPart = new Set(detail.runs.map((r) => r.part)).size > 1;

  const show = (bbox: BBox, run: number) => {
    const m = mapRef.current;
    if (!m) return;
    m.fitBounds(bbox, { padding: 60, maxZoom: 14 });
    m.setFilter("highlight", ["==", ["get", "run"], run]);
  };

  return (
    <>
      <div className="map-wrap" style={{ height: 460, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
        <MapCanvas bounds={detail.trail.bbox} onReady={onReady} />
      </div>
      <div className="legend">
        <span><i style={{ background: COLOURS.covered }} />Walked</span>
        <span><i style={{ background: COLOURS.trail }} />Not yet</span>
      </div>

      <h2>Gaps to walk ({gaps.length})</h2>
      {gaps.length === 0 ? (
        <p className="muted">
          {detail.trail.covered_m > 0 ? "No gaps over 300 m — nice work!" : "You haven't walked any of this trail yet."}
        </p>
      ) : (
        <ul className="gap-list">
          {gaps.slice(0, 30).map((g) => (
            <li key={g.index}>
              <span>
                <strong>{km(g.length_m)} km</strong>{" "}
                <span className="muted small">
                  km {km(g.from_m)}–{km(g.from_m + g.length_m)}
                  {multiPart ? ` of section ${g.part}` : ""}
                </span>
              </span>
              <button onClick={() => show(g.bbox, g.index)}>Show on map</button>
            </li>
          ))}
          {gaps.length > 30 && <li className="muted small">…and {gaps.length - 30} smaller gaps</li>}
        </ul>
      )}
    </>
  );
}
