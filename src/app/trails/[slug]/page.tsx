import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import TrailExplorer from "@/components/TrailExplorer";
import { trailDetail } from "@/lib/queries";
import { getCurrentUserId } from "@/lib/user";
import { date, km, miles, pct } from "@/lib/format";

export default async function TrailPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const detail = await trailDetail(await getCurrentUserId(), slug);
  if (!detail) notFound();
  const t = detail.trail;

  return (
    <main className="page">
      <p className="small"><Link href="/">← All trails</Link></p>
      <h1>{t.name}</h1>
      <div className="stats">
        <div className="stat"><b>{pct(t.covered_m, t.length_m)}%</b><span className="muted small">complete</span></div>
        <div className="stat"><b>{km(t.covered_m)} km</b><span className="muted small">walked ({miles(t.covered_m)} mi)</span></div>
        <div className="stat"><b>{km(Math.max(0, t.length_m - t.covered_m))} km</b><span className="muted small">to go</span></div>
        <div className="stat"><b>{date(t.first_walked)}</b><span className="muted small">first walked</span></div>
        <div className="stat"><b>{date(t.last_walked)}</b><span className="muted small">last walked</span></div>
      </div>

      <TrailExplorer detail={detail} />

      <h2>Activities on this trail ({detail.activities.length})</h2>
      {detail.activities.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <table>
          <thead><tr><th>Date</th><th>Activity</th><th className="num">On trail</th></tr></thead>
          <tbody>
            {detail.activities.map((a) => (
              <tr key={a.id}>
                <td>{date(a.start_time)}</td>
                <td>{a.name ?? "Untitled"}</td>
                <td className="num">{km(a.covered_m)} km</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="attribution">
        Trail length {km(t.length_m)} km, as measured from the official route data. Trail data: {t.attribution} Open
        Government Licence v3.0.
      </p>
    </main>
  );
}
