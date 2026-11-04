"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import MapCanvas from "./MapCanvas";
import { walkedMarkers } from "@/lib/map-markers";

export const COLOURS = { trail: "#c0702a", covered: "#1f8a4c", track: "#2f6fb5" };

export default function OverviewMap() {
  const router = useRouter();
  const [showTracks, setShowTracks] = useState(true);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onReady = useCallback(
    (m: maplibregl.Map) => {
      setMap(m);
      let cancelled = false;
      fetch("/api/map")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => {
          if (cancelled) return;
          m.addSource("tracks", { type: "geojson", data: data.tracks });
          m.addSource("trails", { type: "geojson", data: data.trails });
          m.addSource("covered", { type: "geojson", data: data.covered });
          m.addSource("walked-markers", { type: "geojson", data: walkedMarkers(data.covered) });
          m.addLayer({
            id: "tracks", type: "line", source: "tracks",
            paint: { "line-color": COLOURS.track, "line-width": 1.5, "line-opacity": 0.55 },
          });
          // Famous (OpenStreetMap) routes thin and faint at the bottom; coast paths dashed;
          // National Trails solid on top (they overlap in places).
          m.addLayer({
            id: "trails-famous", type: "line", source: "trails",
            filter: ["in", ["get", "category"], ["literal", ["famous-route", "community", "my-route"]]],
            layout: { "line-cap": "round" },
            paint: {
              "line-color": COLOURS.trail,
              "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 2.5],
              "line-opacity": 0.45,
            },
          });
          m.addLayer({
            id: "trails-coast", type: "line", source: "trails",
            filter: ["==", ["get", "category"], "coast-path"],
            paint: {
              "line-color": COLOURS.trail,
              "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2.2, 12, 4],
              "line-dasharray": [1.6, 1],
              "line-opacity": 0.7,
            },
          });
          m.addLayer({
            id: "trails", type: "line", source: "trails",
            filter: ["==", ["get", "category"], "national-trail"],
            layout: { "line-cap": "round" },
            paint: {
              "line-color": COLOURS.trail,
              "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 12, 3.5],
              "line-opacity": 0.75,
            },
          });
          // Walked sections: white outline underneath so they stand out from everything else.
          m.addLayer({
            id: "covered-casing", type: "line", source: "covered",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 7, 12, 11] },
          });
          m.addLayer({
            id: "covered", type: "line", source: "covered",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": COLOURS.covered, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 4, 12, 7] },
          });
          // A dot per walked route, so short sections are visible zoomed out; fades as you zoom in.
          m.addLayer({
            id: "walked-markers", type: "circle", source: "walked-markers",
            paint: {
              "circle-color": COLOURS.covered,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 6, 9, 5],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
              "circle-opacity": ["interpolate", ["linear"], ["zoom"], 8, 1, 10, 0],
              "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 8, 1, 10, 0],
            },
          });
          // Wide invisible layer makes trails easy to click.
          m.addLayer({
            id: "trails-hit", type: "line", source: "trails",
            paint: { "line-color": "#000", "line-opacity": 0, "line-width": 14 },
          });
          const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
          m.on("mousemove", "trails-hit", (e) => {
            m.getCanvas().style.cursor = "pointer";
            const name = e.features?.[0]?.properties?.name;
            if (name) popup.setLngLat(e.lngLat).setText(String(name)).addTo(m);
          });
          m.on("mouseleave", "trails-hit", () => {
            m.getCanvas().style.cursor = "";
            popup.remove();
          });
          m.on("click", "trails-hit", (e) => {
            const slug = e.features?.[0]?.properties?.slug;
            if (slug) router.push(`/trails/${slug}`);
          });
        })
        .catch((e) => !cancelled && setError(`Couldn't load map data (${e.message})`));
      return () => {
        cancelled = true;
      };
    },
    [router],
  );

  const toggleTracks = () => {
    const next = !showTracks;
    setShowTracks(next);
    if (map?.getLayer("tracks")) map.setLayoutProperty("tracks", "visibility", next ? "visible" : "none");
  };

  return (
    <div className="map-wrap" style={{ position: "relative", height: "100%" }}>
      <MapCanvas onReady={onReady} />
      <div
        style={{
          position: "absolute", top: 10, left: 10, background: "var(--surface)", padding: "6px 10px",
          borderRadius: 8, border: "1px solid var(--border)",
        }}
      >
        <div className="legend" style={{ margin: 0 }}>
          <span><i style={{ background: COLOURS.covered, height: 6, boxShadow: "0 0 0 2px #fff" }} />Walked</span>
          <span><i style={{ background: COLOURS.trail }} />Not yet</span>
          <span>
            <i style={{ background: `repeating-linear-gradient(90deg, ${COLOURS.trail} 0 6px, transparent 6px 10px)` }} />
            Coast path
          </span>
          <span><i style={{ background: COLOURS.trail, height: 2, opacity: 0.6 }} />Famous route</span>
          <label style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={showTracks} onChange={toggleTracks} />{" "}
            <i style={{ background: COLOURS.track }} />My tracks
          </label>
        </div>
        {error && <div className="error small">{error}</div>}
      </div>
    </div>
  );
}
