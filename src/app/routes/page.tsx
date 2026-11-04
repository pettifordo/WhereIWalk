import Link from "next/link";
import { connection } from "next/server";
import DeleteRouteButton from "@/components/DeleteRouteButton";
import RouteUploader from "@/components/RouteUploader";
import { trailSummaries } from "@/lib/queries";
import { listMyRoutes } from "@/lib/user-routes";
import { requireUserId } from "@/lib/user";
import { date, km, pct } from "@/lib/format";

export const metadata = { title: "My routes · WhereIWalk" };

export default async function MyRoutesPage() {
  await connection();
  const userId = await requireUserId();
  const [routes, summaries] = await Promise.all([listMyRoutes(userId), trailSummaries(userId)]);
  const progress = new Map(summaries.map((s) => [s.id, s.covered_m]));

  return (
    <main className="page" style={{ maxWidth: 860 }}>
      <h1>My routes</h1>
      <p>
        Add a route that isn&apos;t in WhereIWalk yet and see how much of it you&apos;ve walked. Upload the route as a
        GPX file (TCX and FIT work too).
      </p>
      <p className="muted small">
        Your uploaded routes are <strong>only visible to you</strong>. An admin can choose to share a route with
        everyone as a Community route.
      </p>
      <p className="warning-box small">
        <strong>Copyright:</strong> many route files, such as those from guidebooks, websites and paid apps, are
        copyright. Only upload files you&apos;re allowed to use, and only ask for a route to be shared if you have the
        right to share it.
      </p>
      <RouteUploader />

      <h2 style={{ marginTop: 28 }}>Your uploads ({routes.length})</h2>
      {routes.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <table>
          <thead><tr><th>Route</th><th className="num">Walked</th><th>Status</th><th>Added</th><th /></tr></thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/trails/${r.slug}`}>{r.name}</Link><div className="muted small">{km(r.length_m)} km</div></td>
                <td className="num">{pct(progress.get(r.id) ?? 0, r.length_m)}%</td>
                <td>{r.shared ? <span className="badge">Shared</span> : <span className="muted">Only you</span>}</td>
                <td className="muted small">{date(r.created_at)}</td>
                <td style={{ textAlign: "right" }}><DeleteRouteButton id={r.id} name={r.name} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
