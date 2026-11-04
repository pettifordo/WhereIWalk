import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import TrailExplorer from "@/components/TrailExplorer";
import { licenceName, trailDetail } from "@/lib/queries";
import { currentUser, requireUserId } from "@/lib/user";
import DeleteRouteButton from "@/components/DeleteRouteButton";
import { date, km, miles, pct } from "@/lib/format";
import { CATEGORY_INFO } from "@/lib/trail-groups";

export default async function TrailPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const userId = await requireUserId();
  const [detail, me] = await Promise.all([trailDetail(userId, slug), currentUser()]);
  if (!detail) notFound();
  const t = detail.trail;
  const canDelete = !!t.upload && (t.upload.ownerId === userId || !!me?.isAdmin);

  return (
    <main className="page">
      <p className="small"><Link href="/">← All trails</Link></p>
      <h1 style={{ marginBottom: 6 }}>{t.name}</h1>
      <p className="small" style={{ marginTop: 0 }}>
        <span className="chip">{CATEGORY_INFO[t.category].title.replace(/s$/, "")}</span>
        {t.series && <span className="muted"> · One stretch of the {t.series}</span>}
        {t.upload && (
          <span className="muted">
            {" "}· Uploaded by {t.upload.ownerId === userId ? "you" : t.upload.owner} ·{" "}
            {t.upload.shared ? "shared with everyone" : "only visible to you"}
          </span>
        )}
      </p>
      {t.upload?.description && <p>{t.upload.description}</p>}
      {canDelete && (
        <p><DeleteRouteButton id={t.id} name={t.name} redirectTo="/routes" /></p>
      )}
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
        Length {km(t.length_m)} km, as measured from the{" "}
        {t.upload ? "uploaded" : t.category === "famous-route" ? "OpenStreetMap" : "official"} route data.{" "}
        {t.upload ? t.attribution : <>Trail data: {t.attribution} {licenceName(t.licence)}.</>}
      </p>
    </main>
  );
}
