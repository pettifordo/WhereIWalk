import Link from "next/link";
import { connection } from "next/server";
import OverviewMap from "@/components/OverviewMap";
import { attributions, trailSummaries } from "@/lib/queries";
import { requireUserId } from "@/lib/user";
import { km, pct } from "@/lib/format";

export default async function Home() {
  await connection();
  const userId = await requireUserId();
  const [trails, attrib] = await Promise.all([trailSummaries(userId), attributions()]);
  const sorted = [...trails].sort((a, b) => b.covered_m / b.length_m - a.covered_m / a.length_m || a.name.localeCompare(b.name));
  const totalDone = trails.reduce((s, t) => s + t.covered_m, 0);
  const total = trails.reduce((s, t) => s + t.length_m, 0);
  const started = trails.filter((t) => t.covered_m > 0).length;

  return (
    <main className="split">
      <aside className="sidebar">
        <h1>National Trails</h1>
        <div className="stats">
          <div className="stat"><b>{km(totalDone)} km</b><span className="muted small">of {km(total)} km walked</span></div>
          <div className="stat"><b>{started}/{trails.length}</b><span className="muted small">trails started</span></div>
        </div>
        {totalDone === 0 && (
          <p className="muted small">
            Nothing walked yet. <Link href="/import">Import your activities</Link> to see your progress.
          </p>
        )}
        <ul className="trail-list">
          {sorted.map((t) => (
            <li key={t.id}>
              <Link href={`/trails/${t.slug}`}>
                <div className="trail-row">
                  <span>{t.name}</span>
                  <span className="muted">{pct(t.covered_m, t.length_m)}%</span>
                </div>
                <div className="bar"><div style={{ width: `${pct(t.covered_m, t.length_m)}%` }} /></div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  {km(t.covered_m)} / {km(t.length_m)} km
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="attribution">
          {attrib.map((a) => <div key={a}>Trail data: {a} Open Government Licence v3.0.</div>)}
        </div>
      </aside>
      <OverviewMap />
    </main>
  );
}
