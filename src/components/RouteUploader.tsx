"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isActivityFile, parseActivityFile } from "@/lib/parse";
import { lineLengthM, type LonLat } from "@/lib/parse/geo";

interface Similar { name: string; slug: string; overlap: number; mine: boolean }

export default function RouteUploader() {
  const router = useRouter();
  const [lines, setLines] = useState<LonLat[][] | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [similar, setSimilar] = useState<Similar[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setLines(null); setSimilar(null); setName(""); setDescription(""); setError(null); };

  async function pick(file: File) {
    reset();
    if (!isActivityFile(file.name)) return setError("Please choose a GPX, TCX or FIT file.");
    setBusy("Reading the file…");
    try {
      const parsed = await parseActivityFile(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!parsed) return setError("No route line in Great Britain was found in that file.");
      setLines(parsed.lines);
      setName(parsed.name ?? file.name.replace(/\.(gpx|tcx|fit)(\.gz)?$/i, "").replace(/[-_]+/g, " "));
    } catch (e) {
      setError(`Couldn't read that file (${(e as Error).message}).`);
    } finally {
      setBusy(null);
    }
  }

  async function save(force: boolean) {
    if (!lines) return;
    setError(null);
    const body = JSON.stringify({ name, description, lines });
    try {
      if (!force) {
        setBusy("Checking for similar routes…");
        const res = await fetch("/api/routes/check", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.similar.length) {
          setSimilar(data.similar);
          return;
        }
      }
      setBusy("Saving and matching your walks…");
      const res = await fetch("/api/routes", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(`/trails/${data.slug}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const lengthKm = lines ? lines.reduce((s, l) => s + lineLengthM(l), 0) / 1000 : 0;

  return (
    <div className="card">
      {!lines ? (
        <label className="dropzone" style={{ display: "block", cursor: "pointer" }}>
          <input
            type="file"
            accept=".gpx,.tcx,.fit,.gz"
            style={{ display: "none" }}
            disabled={!!busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
              e.target.value = "";
            }}
          />
          <strong>Choose a route file</strong>
          <div className="muted small" style={{ marginTop: 6 }}>GPX (route or track), TCX or FIT. One route per file.</div>
        </label>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
          style={{ display: "grid", gap: 10 }}
        >
          <label>
            <div className="small muted">Route name</div>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} style={{ width: "100%" }} />
          </label>
          <label>
            <div className="small muted">Description (optional)</div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} style={{ width: "100%" }} />
          </label>
          <div className="small muted">{lengthKm.toLocaleString("en-GB", { maximumFractionDigits: 1 })} km · {lines.reduce((s, l) => s + l.length, 0).toLocaleString("en-GB")} points</div>

          {similar && (
            <div className="warning-box" role="alert">
              <strong>This looks like a route that&apos;s already here:</strong>
              <ul>
                {similar.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/trails/${s.slug}`} target="_blank">{s.name}</Link>{" "}
                    <span className="muted">({Math.round(s.overlap * 100)}% the same{s.mine ? ", one of your uploads" : ""})</span>
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => save(true)} disabled={!!busy}>Add it anyway</button>
                <button type="button" onClick={reset} disabled={!!busy}>Cancel</button>
              </div>
            </div>
          )}

          {!similar && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" type="submit" disabled={!!busy}>Add route</button>
              <button type="button" onClick={reset} disabled={!!busy}>Choose a different file</button>
            </div>
          )}
        </form>
      )}
      {busy && <p className="muted small">{busy}</p>}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
