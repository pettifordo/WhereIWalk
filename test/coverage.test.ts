// Integration tests: need DATABASE_URL pointing at a database with trails loaded
// (npm run db:migrate && npm run trails:fetch && npm run trails:load).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPool, query } from "../src/lib/db";
import { insertActivities, type ActivityUpload } from "../src/lib/activities";
import { trailDetail, trailSummaries } from "../src/lib/queries";

let userId: number;
/** First ~5 km of The Ridgeway, offset sideways by N metres (keyed by N). */
const offsetTracks = new Map<number, [number, number][]>();

function upload(fp: string, line: [number, number][], startTime = "2026-05-01T09:00:00Z"): ActivityUpload {
  return { source: "gpx", name: fp, type: "Hike", startTime, distanceM: 5000, lines: [line], fingerprint: fp };
}

before(async () => {
  const [u] = await query<{ id: number }>(
    `INSERT INTO users (email) VALUES ('test-coverage@whereiwalk.local')
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
  );
  userId = u.id;
  await query(`DELETE FROM activities WHERE user_id = $1`, [userId]);
  // Offset copies of the start of the longest continuous part of The Ridgeway,
  // made with ST_OffsetCurve so they run parallel to the trail at a fixed distance.
  for (const metres of [15, 150]) {
    const [r] = await query<{ coords: [number, number][] }>(
      `SELECT (ST_AsGeoJSON(ST_Transform(ST_OffsetCurve(ST_LineSubstring(g, 0, 5000 / ST_Length(g)), $1), 4326))::json)->'coordinates' AS coords
       FROM (SELECT (ST_Dump(ST_LineMerge(geom_bng))).geom AS g FROM trails WHERE slug = 'the-ridgeway') d
       ORDER BY ST_Length(g) DESC LIMIT 1`,
      [metres],
    );
    offsetTracks.set(metres, r.coords);
  }
});

after(async () => {
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
  await getPool().end();
});

describe("coverage matching", () => {
  test("a track ~15 m off the trail covers about 5 km of it", async () => {
    const res = await insertActivities(userId, [upload("near", offsetTracks.get(15)!)]);
    assert.equal(res.inserted, 1);
    const ridgeway = (await trailSummaries(userId)).find((t) => t.slug === "the-ridgeway")!;
    assert.ok(ridgeway.covered_m > 4700 && ridgeway.covered_m < 5300, `covered ${ridgeway.covered_m}`);
    assert.equal(ridgeway.first_walked, "2026-05-01");
  });

  test("re-importing the same activity is ignored", async () => {
    const res = await insertActivities(userId, [upload("near", offsetTracks.get(15)!)]);
    assert.equal(res.inserted, 0);
    assert.equal(res.duplicates, 1);
  });

  test("a parallel track 150 m away covers nothing", async () => {
    const res = await insertActivities(userId, [upload("far", offsetTracks.get(150)!)]);
    assert.equal(res.inserted, 1);
    assert.equal(res.segmentsCovered, 0);
  });

  test("trail detail splits the trail into covered and uncovered runs", async () => {
    const d = await trailDetail(userId, "the-ridgeway");
    assert.ok(d);
    const covered = d.runs.filter((r) => r.covered).reduce((s, r) => s + r.length_m, 0);
    const total = d.runs.reduce((s, r) => s + r.length_m, 0);
    assert.ok(Math.abs(total - d.trail.length_m) < 50, "runs add up to trail length");
    assert.ok(covered > 4700 && covered < 5300);
    assert.ok(d.runs.some((r) => !r.covered), "there is at least one gap");
    assert.equal(d.activities.length, 1);
    assert.equal(d.geojson.features.length, d.runs.length);
  });

  test("deleting an activity removes its coverage", async () => {
    await query(`DELETE FROM activities WHERE user_id = $1 AND fingerprint = 'near'`, [userId]);
    const ridgeway = (await trailSummaries(userId)).find((t) => t.slug === "the-ridgeway")!;
    assert.equal(ridgeway.covered_m, 0);
  });
});
