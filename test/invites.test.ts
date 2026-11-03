import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPool, query } from "../src/lib/db";
import { normaliseEmail } from "../src/lib/allowlist";
import { addInvite, canSignIn, deleteRemovedUser, listInvites, listRemoved, removeInvite } from "../src/lib/invites";
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

  test("removed people are listed with their walks, and can be deleted only once removed", async () => {
    await addInvite(GUEST, "Guest", adminId);
    const guestId = await upsertUserByEmail(GUEST, "Guest");
    await query(
      `INSERT INTO activities (user_id, source, fingerprint, start_time, distance_m, geom, geom_bng)
       SELECT $1, 'gpx', 'inv-fp', '2026-06-01T10:00:00Z', 1000, g, ST_Transform(g, 27700)
       FROM (SELECT ST_SetSRID(ST_GeomFromText('MULTILINESTRING((-1.8 53.36, -1.79 53.36))'), 4326) g) x`,
      [guestId],
    );
    assert.equal((await listRemoved()).some((r) => r.email === GUEST), false, "invited people aren't 'removed'");
    assert.equal(await deleteRemovedUser(GUEST), false, "can't delete while still invited");
    assert.equal(await deleteRemovedUser(ADMIN), false, "can't delete an admin");

    await removeInvite(GUEST, false);
    const r = (await listRemoved()).find((x) => x.email === GUEST)!;
    assert.equal(r.activities, 1);
    assert.equal(r.name, "Guest");
    assert.ok(r.last_walk?.startsWith("2026-06-01"));
    assert.equal((await listRemoved()).some((x) => x.email === ADMIN), false, "admins never listed");

    assert.equal(await deleteRemovedUser(GUEST), true);
    assert.equal((await listRemoved()).some((x) => x.email === GUEST), false);
    assert.equal((await query(`SELECT 1 FROM activities WHERE user_id = $1`, [guestId])).length, 0);
  });
});
