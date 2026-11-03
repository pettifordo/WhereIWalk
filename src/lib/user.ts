import { query } from "./db";

/**
 * Phase 1 is single-user: everyone who gets past the site login is the owner.
 * Phase 2 replaces this with real per-user accounts.
 */
const OWNER_EMAIL = "owner@whereiwalk.local";

let cached: number | undefined;

export async function getCurrentUserId(): Promise<number> {
  if (cached !== undefined) return cached;
  const rows = await query<{ id: number }>(
    `INSERT INTO users (email, display_name) VALUES ($1, 'Owner')
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [OWNER_EMAIL],
  );
  cached = rows[0].id;
  return cached;
}
