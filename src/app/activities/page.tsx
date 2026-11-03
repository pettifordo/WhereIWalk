import Link from "next/link";
import { connection } from "next/server";
import DeleteActivityButton from "@/components/DeleteActivityButton";
import { listActivities } from "@/lib/activities";
import { getCurrentUserId } from "@/lib/user";
import { date, km } from "@/lib/format";

export default async function ActivitiesPage() {
  await connection();
  const activities = await listActivities(await getCurrentUserId());
  return (
    <main className="page">
      <h1>Activities ({activities.length})</h1>
      {activities.length === 0 ? (
        <p>No activities yet. <Link href="/import">Import some</Link>.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Date</th><th>Name</th><th>Type</th><th className="num">Distance</th><th className="num">Trail km</th><th /></tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id}>
                <td>{date(a.start_time)}</td>
                <td>{a.name ?? "Untitled"}</td>
                <td className="muted">{a.activity_type ?? "—"}</td>
                <td className="num">{km(a.distance_m)} km</td>
                <td className="num">{a.segments ? `~${km(a.segments * 100)}` : "—"}</td>
                <td><DeleteActivityButton id={a.id} name={a.name ?? "Untitled"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
