// Integration tests for member-uploaded routes (needs the local database with trails).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPool, query } from "../src/lib/db";
import { insertActivities } from "../src/lib/activities";
import { trailSummaries, trailsOverview } from "../src/lib/queries";
import { createUserRoute, deleteUpload, findSimilarRoutes, listAllUploads, setShared, validateRouteUpload } from "../src/lib/user-routes";

let alice: number;
let bob: number;
let ridgewayCopy: [number, number][][];
const made: [number, number][] = Array.from({ length: 300 }, (_, i) => [-0.9 + i * 0.0006, 54.0 + 0.01 * Math.sin(i / 15)]);

before(async () => {
  await query(`DELETE FROM users WHERE email LIKE 'ur-%@whereiwalk.test'`);
  [{ id: alice }] = await query<{ id: number }>(`INSERT INTO users (email, display_name) VALUES ('ur-alice@whereiwalk.test', 'Alice') RETURNING id`);
  [{ id: bob }] = await query<{ id: number }>(`INSERT INTO users (email, display_name) VALUES ('ur-bob@whereiwalk.test', 'Bob') RETURNING id`);
  const [r] = await query<{ c: [number, number][] }>(
    `SELECT (ST_AsGeoJSON(ST_Transform(ST_LineSubstring(g, 0, 8000 / ST_Length(g)), 4326))::json)->'coordinates' AS c
     FROM (SELECT (ST_Dump(ST_LineMerge(geom_bng))).geom g FROM trails WHERE slug = 'the-ridgeway') d ORDER BY ST_Length(g) DESC LIMIT 1`,
  );
  ridgewayCopy = [r.c];
  // Bob has already walked the made-up route.
  await insertActivities(bob, [{ source: "gpx", name: "Bob's walk", type: "Hike", startTime: "2026-06-01T10:00:00Z", distanceM: 11000, lines: [made], fingerprint: "ur-bob" }]);
});

after(async () => {
  await query(`DELETE FROM users WHERE email LIKE 'ur-%@whereiwalk.test'`);
  await getPool().end();
});

describe("member-uploaded routes", () => {
  test("validation", () => {
    assert.throws(() => validateRouteUpload({ name: "x", lines: [made] }), /name/);
    assert.throws(() => validateRouteUpload({ name: "Good", lines: [] }), /no route/);
    assert.throws(() => validateRouteUpload({ name: "Good", lines: [[[0, 0]]] }), /2 or more/);
    assert.equal(validateRouteUpload({ name: "  Good  ", lines: [made] }).name, "Good");
  });

  test("a copy of an existing route is reported as similar", async () => {
    const { lengthKm, similar } = await findSimilarRoutes(alice, ridgewayCopy);
    assert.ok(lengthKm > 7.5 && lengthKm < 8.5, `length ${lengthKm}`);
    assert.equal(similar[0]?.name, "The Ridgeway");
    assert.ok(similar[0].overlap > 0.9);
    const fresh = await findSimilarRoutes(alice, [made]);
    assert.equal(fresh.similar.length, 0);
  });

  test("an upload is private to its owner until shared; sharing matches everyone's walks", async () => {
    const slug = await createUserRoute(alice, "Alice", { name: "Wolds Wiggle", description: "Test", lines: [made] });
    const aliceSees = (await trailSummaries(alice)).find((t) => t.slug === slug);
    assert.equal(aliceSees?.category, "my-route");
    assert.equal((await trailSummaries(bob)).some((t) => t.slug === slug), false, "Bob can't see it");
    const overview = await trailsOverview(bob);
    assert.equal(overview.features.some((f) => (f as { properties: { slug: string } }).properties.slug === slug), false);

    const up = (await listAllUploads()).find((u) => u.slug === slug)!;
    assert.equal(up.owner, "Alice");
    assert.equal(up.shared, false);

    assert.equal(await setShared([up.id], true), 1);
    const bobSees = (await trailSummaries(bob)).find((t) => t.slug === slug);
    assert.equal(bobSees?.category, "community");
    assert.ok(bobSees!.covered_m > 8000, `Bob's walk now counts: ${bobSees!.covered_m}`);

    assert.equal(await setShared([up.id], false), 1);
    assert.equal((await trailSummaries(bob)).some((t) => t.slug === slug), false, "private again");

    assert.equal(await deleteUpload(up.id, bob), false, "Bob can't delete Alice's route");
    assert.equal(await deleteUpload(up.id, alice), true);
  });
});
