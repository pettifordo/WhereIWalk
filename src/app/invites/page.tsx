import { redirect } from "next/navigation";
import { connection } from "next/server";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { addInvite, listInvites, removeInvite } from "@/lib/invites";
import { requireAdmin } from "@/lib/user";
import { date } from "@/lib/format";

async function invite(fd: FormData) {
  "use server";
  const admin = await requireAdmin();
  let email: string;
  try {
    email = await addInvite(String(fd.get("email") ?? ""), String(fd.get("name") ?? "") || null, admin.id);
  } catch (e) {
    redirect(`/invites?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/invites?added=${encodeURIComponent(email)}`);
}

async function remove(fd: FormData) {
  "use server";
  await requireAdmin();
  const email = String(fd.get("email") ?? "");
  await removeInvite(email, fd.get("deleteData") === "1");
  redirect(`/invites?removed=${encodeURIComponent(email)}`);
}

export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; added?: string; removed?: string }>;
}) {
  await connection();
  const me = await requireAdmin();
  const { error, added, removed } = await searchParams;
  const people = await listInvites();

  return (
    <main className="page" style={{ maxWidth: 860 }}>
      <h1>Invites</h1>
      <p className="muted">
        People on this list can sign in to WhereIWalk with their Google account. Each person only sees their own walks.
      </p>

      <form action={invite} className="invite-form">
        <input name="email" type="email" placeholder="their Google email" required aria-label="Email" />
        <input name="name" type="text" placeholder="name (optional)" aria-label="Name" maxLength={100} />
        <button className="primary" type="submit">Invite</button>
      </form>
      {error && <p className="error">{error}</p>}
      {added && <p className="ok">Invited {added}. Send them the link to this site so they can sign in with Google.</p>}
      {removed && <p className="ok">Removed {removed}.</p>}

      <table style={{ marginTop: 16 }}>
        <thead>
          <tr><th>Person</th><th>Status</th><th className="num">Walks</th><th>Invited</th><th /></tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.email}>
              <td>
                {p.name && <div>{p.name}</div>}
                <div className={p.name ? "muted small" : ""}>{p.email}</div>
              </td>
              <td>
                {p.is_admin ? <span className="badge">Admin</span> : p.signed_in ? "Signed in" : <span className="muted">Not yet</span>}
              </td>
              <td className="num">{p.activities}</td>
              <td className="muted small">{p.is_admin ? "—" : date(p.created_at)}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {p.is_admin ? (
                  <span className="muted small">{p.email === me.email ? "you" : "set in Vercel"}</span>
                ) : (
                  <form action={remove} style={{ display: "inline-flex", gap: 6 }}>
                    <input type="hidden" name="email" value={p.email} />
                    <ConfirmSubmit message={`Remove ${p.email}? They won't be able to sign in. Their walks are kept.`}>
                      Remove
                    </ConfirmSubmit>
                    {p.signed_in && (
                      <ConfirmSubmit
                        name="deleteData"
                        value="1"
                        className="danger"
                        message={`Remove ${p.email} AND permanently delete all their walks and trail progress? This can't be undone.`}
                      >
                        Remove + delete walks
                      </ConfirmSubmit>
                    )}
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="muted small" style={{ marginTop: 20 }}>
        Admins are set by the <code>ALLOWED_EMAILS</code> setting in Vercel and can&apos;t be removed here. While the
        Google sign-in app is in &ldquo;Testing&rdquo; mode, new people also need adding as Test users in Google Cloud
        Console (or publish the app).
      </p>
    </main>
  );
}
