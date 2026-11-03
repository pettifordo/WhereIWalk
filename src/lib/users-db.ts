import { allowedEmails } from "./allowlist";
import { getPool } from "./db";

/** Placeholder account used before Google login existed (single shared login). */
export const LEGACY_OWNER_EMAIL = "owner@whereiwalk.local";

/**
 * Find or create the user for this email and return their id. When the owner
 * (first ALLOWED_EMAILS entry) signs in for the first time, any data from the
 * old single-login placeholder account becomes theirs.
 */
export async function upsertUserByEmail(email: string, name: string | null): Promise<number> {
  const e = email.trim().toLowerCase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ id: number }>(`SELECT id FROM users WHERE email = $1`, [e]);
    if (!existing.rows[0] && allowedEmails()[0] === e) {
      const claimed = await client.query<{ id: number }>(
        `UPDATE users SET email = $1, display_name = $2 WHERE email = $3 RETURNING id`,
        [e, name, LEGACY_OWNER_EMAIL],
      );
      if (claimed.rows[0]) {
        await client.query("COMMIT");
        return claimed.rows[0].id;
      }
    }
    const res = await client.query<{ id: number }>(
      `INSERT INTO users (email, display_name) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, users.display_name)
       RETURNING id`,
      [e, name],
    );
    await client.query("COMMIT");
    return res.rows[0].id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
