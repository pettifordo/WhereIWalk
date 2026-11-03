import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPool, query } from "../src/lib/db";
import { isAdminEmail, parseAllowedEmails } from "../src/lib/allowlist";
import { LEGACY_OWNER_EMAIL, upsertUserByEmail } from "../src/lib/users-db";

const OWNER = "test-owner@whereiwalk.test";
const FRIEND = "test-friend@whereiwalk.test";

after(async () => {
  await query(`DELETE FROM users WHERE email = ANY($1)`, [[OWNER, FRIEND, LEGACY_OWNER_EMAIL]]);
  await getPool().end();
});

describe("invite list", () => {
  test("parses commas, spaces and newlines; lower-cases", () => {
    assert.deepEqual(parseAllowedEmails(" A@x.com, b@y.org\nc@z.net ;; junk "), ["a@x.com", "b@y.org", "c@z.net"]);
  });
  test("empty list allows nobody", () => {
    assert.equal(isAdminEmail("a@x.com", parseAllowedEmails("")), false);
    assert.equal(isAdminEmail(null, ["a@x.com"]), false);
  });
  test("matching is case-insensitive", () => {
    assert.equal(isAdminEmail("Owen@Example.com", ["owen@example.com"]), true);
  });
});

describe("users", () => {
  test("owner's first sign-in claims the old single-login data; others get their own account", async () => {
    process.env.ALLOWED_EMAILS = `${OWNER}, ${FRIEND}`;
    await query(`DELETE FROM users WHERE email = ANY($1)`, [[OWNER, FRIEND, LEGACY_OWNER_EMAIL]]);
    const [legacy] = await query<{ id: number }>(`INSERT INTO users (email) VALUES ($1) RETURNING id`, [LEGACY_OWNER_EMAIL]);

    const friendId = await upsertUserByEmail(FRIEND, "Friend");
    assert.notEqual(friendId, legacy.id, "a non-owner must not claim the legacy data");

    const ownerId = await upsertUserByEmail(OWNER.toUpperCase(), "Owner");
    assert.equal(ownerId, legacy.id, "owner takes over the legacy account");
    assert.equal(await upsertUserByEmail(OWNER, null), ownerId, "same id on later sign-ins");
    const rows = await query(`SELECT 1 FROM users WHERE email = $1`, [LEGACY_OWNER_EMAIL]);
    assert.equal(rows.length, 0);
  });
});
