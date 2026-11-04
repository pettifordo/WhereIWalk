import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import AdminTabs from "@/components/AdminTabs";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { deleteUpload, listAllUploads, setShared } from "@/lib/user-routes";
import { requireAdmin } from "@/lib/user";
import { date, km } from "@/lib/format";

export const metadata = { title: "Community routes · WhereIWalk" };
export const maxDuration = 60;

/** Per-row buttons send `only`; the bulk buttons use the ticked `ids`. */
const chosen = (fd: FormData) =>
  (fd.getAll("only").length ? fd.getAll("only") : fd.getAll("ids")).map(Number).filter((n) => Number.isInteger(n) && n > 0);

async function share(fd: FormData) {
  "use server";
  await requireAdmin();
  const n = await setShared(chosen(fd), true);
  redirect(`/admin/routes?msg=${encodeURIComponent(`Shared ${n} route${n === 1 ? "" : "s"} with everyone.`)}`);
}

async function unshare(fd: FormData) {
  "use server";
  await requireAdmin();
  const n = await setShared(chosen(fd), false);
  redirect(`/admin/routes?msg=${encodeURIComponent(`Made ${n} route${n === 1 ? "" : "s"} private again.`)}`);
}

async function remove(fd: FormData) {
  "use server";
  const admin = await requireAdmin();
  let n = 0;
  for (const id of chosen(fd)) if (await deleteUpload(id, admin.id, true)) n++;
  redirect(`/admin/routes?msg=${encodeURIComponent(`Deleted ${n} route${n === 1 ? "" : "s"}.`)}`);
}

export default async function CommunityRoutesAdmin({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireAdmin();
  const { msg } = await searchParams;
  const uploads = await listAllUploads();
  const waiting = uploads.filter((u) => !u.shared).length;

  return (
    <main className="page" style={{ maxWidth: 980 }}>
      <AdminTabs active="routes" />
      <h1>Community routes</h1>
      <p className="muted">
        Routes members have uploaded. They&apos;re private to the uploader until you share them; shared routes appear
        for everyone under <strong>Community routes</strong>, and everyone&apos;s walks are matched against them. Only
        share routes the uploader is allowed to share (for example, not a guidebook&apos;s paid-for GPX).
      </p>
      {msg && <p className="ok">{msg}</p>}

      {uploads.length === 0 ? (
        <p>No uploads yet. Members add routes on their <Link href="/routes">My routes</Link> page.</p>
      ) : (
        <>
          {/* Bulk actions: the tick boxes in the table belong to this form via form="bulk". */}
          <form id="bulk" className="bulk-bar">
            <span className="muted small">{waiting} waiting · {uploads.length - waiting} shared · tick routes, then:</span>
            <button formAction={share} className="primary">Share selected</button>
            <button formAction={unshare}>Make selected private</button>
            <ConfirmSubmit className="danger" formAction={remove} message="Delete the selected routes? Members' walks are kept.">
              Delete selected
            </ConfirmSubmit>
          </form>
          <table>
            <thead>
              <tr><th aria-label="Select" /><th>Route</th><th>Uploaded by</th><th>Similar to</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id}>
                  <td><input type="checkbox" form="bulk" name="ids" value={u.id} aria-label={`Select ${u.name}`} /></td>
                  <td>
                    <Link href={`/trails/${u.slug}`}>{u.name}</Link>
                    <div className="muted small">{km(u.length_m)} km · {date(u.created_at)}</div>
                    {u.description && <div className="small">{u.description}</div>}
                  </td>
                  <td className="small">{u.owner}</td>
                  <td className="small">
                    {u.similar_to ? <>{u.similar_to} <span className="muted">({Math.round((u.similar_overlap ?? 0) * 100)}%)</span></> : <span className="muted">—</span>}
                  </td>
                  <td>{u.shared ? <span className="badge">Shared</span> : <span className="muted">Private</span>}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <form action={u.shared ? unshare : share}>
                      <input type="hidden" name="only" value={u.id} />
                      <button type="submit" className={u.shared ? undefined : "primary"}>{u.shared ? "Make private" : "Share"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
