import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import TrailExplorer from "@/components/TrailExplorer";
import { licenceName, trailDetail } from "@/lib/queries";
import { requireUserId } from "@/lib/user";
import { date, km, miles, pct } from "@/lib/format";
import { CATEGORY_INFO } from "@/lib/trail-groups";

export default async function TrailPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const detail = await trailDetail(await requireUserId(), slug);
  if (!detail) notFound();
  const t = detail.trail;

  return (
    <main className="page">
      <p className="small"><Link href="/">← All trails</Link></p>
      <h1 style={{ marginBottom: 6 }}>{t.name}</h1>
      <p className="small" style={{ marginTop: 0 }}>
        <span className="chip">{CATEGORY_INFO[t.category].title.replace(/s$/, "")}</span>
        {t.series && <span className="muted"> · One stretch of the {t.series}</span>}
      </p>
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
        Length {km(t.length_m)} km, as measured from the {t.category === "famous-route" ? "OpenStreetMap" : "official"} route
        data. Trail data: {t.attribution} {licenceName(t.licence)}.
      </p>
    </main>
  );
}
