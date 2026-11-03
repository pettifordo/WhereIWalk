"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";

/** Free OpenStreetMap-based vector tiles; no API key needed. */
export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const UK_BOUNDS: [number, number, number, number] = [-8.2, 49.8, 1.9, 58.8];

export type BBox = [number, number, number, number];

// Served from public/ (copied there by scripts/copy-maplibre-worker.mjs).
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/**
 * A MapLibre map that fills its parent. `onReady` runs once the style has loaded,
 * which is when sources and layers can be added.
 */
export default function MapCanvas({
  bounds = UK_BOUNDS,
  onReady,
}: {
  bounds?: BBox;
  onReady: (map: maplibregl.Map) => void | (() => void);
}) {
  const ref = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: BASEMAP_STYLE,
      bounds,
      fitBoundsOptions: { padding: 30 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    let cleanup: void | (() => void);
    map.on("load", () => {
      cleanup = readyRef.current(map);
    });
    return () => {
      cleanup?.();
      map.remove();
    };
    // bounds only matter on first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="map" />;
}
