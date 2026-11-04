import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { nameKey, routesFromElements } from "../src/lib/osm-routes";

const way = (ref: number, role: string, pts: number[][]) => ({
  type: "way", ref, role, geometry: pts.map(([lon, lat]) => ({ lon, lat })),
});

describe("OpenStreetMap routes", () => {
  test("relations become routes; alternatives and unnamed relations are skipped", () => {
    const routes = routesFromElements([
      { type: "relation", id: 1, tags: { name: "Dales Way", network: "rwn" }, members: [
        way(10, "", [[-2, 54], [-2, 54.1]]), way(11, "alternative", [[-2.1, 54], [-2.1, 54.5]]),
        { type: "node", ref: 5, role: "start" },
      ] },
      { type: "relation", id: 2, tags: { network: "rwn" }, members: [way(20, "", [[0, 51], [0, 51.1]])] },
    ]);
    assert.equal(routes.length, 1);
    assert.equal(routes[0].lines.length, 1, "alternative member skipped");
    assert.ok(Math.abs(routes[0].lengthM - 11120) < 50, `length ${routes[0].lengthM}`);
  });

  test("relations sharing a name are merged (e.g. a route mapped in sections)", () => {
    const routes = routesFromElements([
      { type: "relation", id: 1, tags: { name: "Cumbria Way" }, members: [way(1, "", [[-3, 54], [-3, 54.1]])] },
      { type: "relation", id: 2, tags: { name: "cumbria way " }, members: [way(2, "", [[-3, 54.1], [-3, 54.2]])] },
    ]);
    assert.equal(routes.length, 1);
    assert.deepEqual(routes[0].ids, [1, 2]);
    assert.equal(routes[0].lines.length, 2);
  });

  test("name keys ignore 'The' and 'National Trail'", () => {
    assert.equal(nameKey("The Ridgeway National Trail"), nameKey("Ridgeway"));
    assert.equal(nameKey("Offa's Dyke Path"), nameKey("Offas Dyke Path"));
  });
});
