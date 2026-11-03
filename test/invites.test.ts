import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPool, query } from "../src/lib/db";
import { normaliseEmail } from "../src/lib/allowlist";
import { addInvite, canSignIn, listInvites, removeInvite } from "../src/lib/invites";
import { upsertUserByEmail } from "../src/lib/users-db";

const ADMIN = "inv-admin@whereiwalk.test";
const GUEST = "inv-guest@whereiwalk.test";
let adminId: number;

before(async () => {
  process.env.ALLOWED_EMAILS = ADMIN;
  await query(`DELETE FROM invites WHERE email LIKE 'inv-%@whereiwalk.test'`);
  await query(`DELETE FROM users WHERE email LIKE 'inv-%@whereiwalk.test'`);
  adminId = await upsertUserByEmail(ADMIN, "Admin");
});

after(async () => {
  await query(`DELETE FROM invites WHERE email LIKE 'inv-%@whereiwalk.test'`);
  await query(`DELETE FROM users WHERE email LIKE 'inv-%@whereiwalk.test'`);
  await getPool().end();
});

describe("invites", () => {
  test("email normalisation", () => {
    assert.equal(normaliseEmail("  Bob@Example.COM "), "bob@example.com");
    assert.equal(normaliseEmail("not an email"), null);
    assert.equal(normaliseEmail("a@b"), null);
  });

  test("admins can always sign in; strangers can't", async () => {
    assert.equal(await canSignIn(ADMIN.toUpperCase()), true);
    assert.equal(await canSignIn(GUEST), false);
    assert.equal(await canSignIn(null), false);
  });

  test("inviting lets someone sign in; the list shows them", async () => {
    const email = await addInvite(` ${GUEST.toUpperCase()} `, "Guest", adminId);
    assert.equal(email, GUEST);
    assert.equal(await canSignIn(GUEST), true);
    const rows = await listInvites();
    const g = rows.find((r) => r.email === GUEST)!;
    assert.equal(g.name, "Guest");
    assert.equal(g.is_admin, false);
    assert.equal(g.signed_in, false);
    assert.equal(rows[0].email, ADMIN, "admins listed first");
    assert.equal(rows[0].is_admin, true);
    await assert.rejects(addInvite("nonsense", null, adminId));
  });

  test("removing an invite blocks sign-in; data kept unless asked to delete", async () => {
    const guestId = await upsertUserByEmail(GUEST, "Guest");
    assert.equal((await listInvites()).find((r) => r.email === GUEST)!.signed_in, true);
    await removeInvite(GUEST, false);
    assert.equal(await canSignIn(GUEST), false);
    assert.equal((await query(`SELECT 1 FROM users WHERE id = $1`, [guestId])).length, 1, "account kept");
    await addInvite(GUEST, null, adminId);
    await removeInvite(GUEST, true);
    assert.equal((await query(`SELECT 1 FROM users WHERE id = $1`, [guestId])).length, 0, "account deleted");
  });
});
