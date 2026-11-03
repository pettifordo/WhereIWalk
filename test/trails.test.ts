import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { groupLines, linesOf } from "../src/lib/trail-sources";
import { groupTrails } from "../src/lib/trail-groups";
import type { TrailSummary } from "../src/lib/queries";

describe("trail sources", () => {
  test("linesOf flattens line geometries and ignores others", () => {
    assert.equal(linesOf({ type: "LineString", coordinates: [[0, 0], [1, 1]] }).length, 1);
    assert.equal(linesOf({ type: "MultiLineString", coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] }).length, 2);
    assert.equal(linesOf({ type: "Point", coordinates: [0, 0] }).length, 0);
    assert.equal(linesOf(null).length, 0);
  });

  test("groupLines merges features by key and drops empty/degenerate lines", () => {
    const f = (name: string | null, coords: number[][]) => ({
      properties: { name }, geometry: { type: "LineString", coordinates: coords },
    });
    const g = groupLines(
      [f("A", [[0, 0], [1, 1]]), f("B", [[5, 5], [6, 6]]), f("A", [[1, 1], [2, 2]]), f(null, [[9, 9], [8, 8]]), f("B", [[7, 7]])],
      (x) => (x.properties.name as string | null) ?? null,
    );
    assert.deepEqual([...g.keys()].sort(), ["A", "B"]);
    assert.equal(g.get("A")!.length, 2);
    assert.equal(g.get("B")!.length, 1, "single-point line dropped");
  });
});

describe("trail grouping", () => {
  const t = (id: number, name: string, category: TrailSummary["category"], series: string | null, length_m: number, covered_m: number): TrailSummary =>
    ({ id, slug: `t${id}`, name, category, series, length_m, covered_m, first_walked: null, last_walked: null });

  test("groups by category, rolls stretches up into their series", () => {
    const groups = groupTrails([
      t(1, "Pennine Way", "national-trail", null, 400, 40),
      t(2, "Cotswold Way", "national-trail", null, 160, 0),
      t(3, "Wales Coast Path", "coast-path", null, 1400, 0),
      t(4, "B stretch", "coast-path", "England Coast Path", 100, 50),
      t(5, "A stretch", "coast-path", "England Coast Path", 300, 0),
    ]);
    assert.deepEqual(groups.map((g) => g.category), ["national-trail", "coast-path"]);
    const [nat, coast] = groups;
    assert.equal(nat.trails[0].name, "Pennine Way", "most complete first");
    assert.equal(nat.started, 1);
    assert.equal(coast.count, 2, "Wales Coast Path + one series");
    assert.equal(coast.series[0].length_m, 400);
    assert.equal(coast.series[0].covered_m, 50);
    assert.deepEqual(coast.series[0].trails.map((x) => x.name), ["A stretch", "B stretch"]);
    assert.equal(coast.started, 1);
    assert.equal(coast.length_m, 1800);
  });

  test("empty categories are left out", () => {
    assert.deepEqual(groupTrails([t(1, "X", "national-trail", null, 1, 0)]).map((g) => g.category), ["national-trail"]);
  });
});
