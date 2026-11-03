import { adminEmails, isAdminEmail, normaliseEmail } from "./allowlist";
import { query } from "./db";

/** May this email sign in? Admins (ALLOWED_EMAILS) or anyone on the invite list. */
export async function canSignIn(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  if (isAdminEmail(email)) return true;
  const rows = await query(`SELECT 1 FROM invites WHERE email = $1`, [email.trim().toLowerCase()]);
  return rows.length > 0;
}

export interface InviteRow {
  email: string;
  name: string | null;
  created_at: string | null;
  is_admin: boolean;
  signed_in: boolean;
  activities: number;
}

/** Admins and invitees, with whether they've signed in and how many activities they have. */
export async function listInvites(): Promise<InviteRow[]> {
  return query<InviteRow>(
    `
    WITH people AS (
      SELECT email, name, created_at, false AS is_admin FROM invites
      UNION ALL
      SELECT a.email, NULL, NULL, true FROM unnest($1::text[]) AS a(email)
    )
    SELECT p.email,
           COALESCE(p.name, u.display_name) AS name,
           p.created_at,
           bool_or(p.is_admin) AS is_admin,
           (u.id IS NOT NULL) AS signed_in,
           COALESCE((SELECT count(*)::int FROM activities a WHERE a.user_id = u.id), 0) AS activities
    FROM people p LEFT JOIN users u ON u.email = p.email
    GROUP BY p.email, p.name, p.created_at, u.id, u.display_name
    ORDER BY bool_or(p.is_admin) DESC, p.created_at DESC NULLS LAST, p.email
    `,
    [adminEmails()],
  );
}

export async function addInvite(rawEmail: string, name: string | null, invitedBy: number): Promise<string> {
  const email = normaliseEmail(rawEmail);
  if (!email) throw new Error("That doesn't look like an email address.");
  await query(
    `INSERT INTO invites (email, name, invited_by) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, invites.name)`,
    [email, name?.trim().slice(0, 100) || null, invitedBy],
  );
  return email;
}

/** Remove someone's invite. With deleteData, their account and activities go too. */
export async function removeInvite(email: string, deleteData: boolean): Promise<void> {
  const e = email.trim().toLowerCase();
  await query(`DELETE FROM invites WHERE email = $1`, [e]);
  if (deleteData) await query(`DELETE FROM users WHERE email = $1`, [e]);
}
