"use client";

import { useState } from "react";
import Link from "next/link";
import {
  type ParseIssue,
  type ParsedActivity,
  isActivityFile,
  parseActivityFile,
  parseStravaExport,
} from "@/lib/parse";

const BATCH_SIZE = 20;

type Phase = "idle" | "reading" | "uploading" | "done" | "error";

interface Summary {
  found: number;
  skipped: number;
  inserted: number;
  duplicates: number;
  issues: ParseIssue[];
}

export default function ImportPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: File[]) {
    setError(null);
    setSummary(null);
    try {
      setPhase("reading");
      const activities: ParsedActivity[] = [];
      const issues: ParseIssue[] = [];
      let skipped = 0;

      for (const zipFile of files.filter((f) => f.name.toLowerCase().endsWith(".zip"))) {
        const res = await parseStravaExport(zipFile, (p) =>
          setProgress({ done: p.done, total: p.total, label: `Reading ${zipFile.name}` }),
        );
        activities.push(...res.activities);
        issues.push(...res.issues);
        skipped += res.skipped;
      }

      const singles = files.filter((f) => isActivityFile(f.name));
      for (let i = 0; i < singles.length; i++) {
        const f = singles[i];
        setProgress({ done: i, total: singles.length, label: `Reading ${f.name}` });
        try {
          const a = await parseActivityFile(f.name, new Uint8Array(await f.arrayBuffer()));
          if (a) activities.push(a);
          else skipped++;
        } catch (e) {
          issues.push({ file: f.name, reason: (e as Error).message });
        }
      }

      const ignored = files.filter((f) => !f.name.toLowerCase().endsWith(".zip") && !isActivityFile(f.name));
      for (const f of ignored) issues.push({ file: f.name, reason: "Not a .zip, .gpx, .tcx or .fit file" });

      setPhase("uploading");
      let inserted = 0;
      let duplicates = 0;
      for (let i = 0; i < activities.length; i += BATCH_SIZE) {
        setProgress({ done: i, total: activities.length, label: "Matching against trails" });
        const res = await fetch("/api/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activities: activities.slice(i, i + BATCH_SIZE) }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Upload failed (HTTP ${res.status})`);
        }
        const body = await res.json();
        inserted += body.inserted;
        duplicates += body.duplicates;
      }
      setProgress({ done: activities.length, total: activities.length, label: "" });
      setSummary({ found: activities.length, skipped, inserted, duplicates, issues });
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  const busy = phase === "reading" || phase === "uploading";
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div>
      <label
        className={`dropzone${dragging ? " active" : ""}`}
        style={{ display: "block", cursor: busy ? "default" : "pointer" }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) handleFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <input
          type="file"
          multiple
          accept=".zip,.gpx,.tcx,.fit,.gz"
          disabled={busy}
          style={{ display: "none" }}
          onChange={(e) => {
            handleFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <strong>Drop your Strava export ZIP here</strong>
        <div className="muted small" style={{ marginTop: 6 }}>
          …or GPX, TCX and FIT files. Click to choose files.
        </div>
      </label>

      {busy && (
        <div style={{ marginTop: 16 }}>
          <div className="small">{progress.label} — {progress.done} of {progress.total}</div>
          <div className="progress"><div style={{ width: `${percent}%` }} /></div>
        </div>
      )}

      {error && <p className="error">Import stopped: {error}</p>}

      {summary && (
        <div style={{ marginTop: 16 }}>
          <h2>Import complete</h2>
          <ul>
            <li>{summary.inserted} new activities added</li>
            {summary.duplicates > 0 && <li>{summary.duplicates} already imported (skipped)</li>}
            {summary.skipped > 0 && <li>{summary.skipped} had no GPS track in Great Britain (skipped)</li>}
            {summary.issues.length > 0 && <li className="error">{summary.issues.length} files couldn&apos;t be read</li>}
          </ul>
          {summary.issues.length > 0 && (
            <details>
              <summary className="small">Show problem files</summary>
              <ul className="small">
                {summary.issues.slice(0, 100).map((i) => <li key={i.file}>{i.file}: {i.reason}</li>)}
              </ul>
            </details>
          )}
          <p><Link href="/">See your trail progress →</Link></p>
        </div>
      )}
    </div>
  );
}
