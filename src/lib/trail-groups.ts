import type { TrailSummary } from "./queries";

export interface SeriesGroup {
  name: string;
  length_m: number;
  covered_m: number;
  trails: TrailSummary[];
}

export interface CategoryGroup {
  category: TrailSummary["category"];
  title: string;
  blurb: string;
  length_m: number;
  covered_m: number;
  started: number;
  count: number;
  /** Stand-alone trails, then multi-stretch routes. */
  trails: TrailSummary[];
  series: SeriesGroup[];
}

export const CATEGORY_INFO: Record<TrailSummary["category"], { title: string; blurb: string }> = {
  "national-trail": {
    title: "National Trails",
    blurb: "Long-distance routes officially designated in England and Wales.",
  },
  "coast-path": {
    title: "Coast paths",
    blurb: "Routes around the coasts of Wales and England. They overlap some National Trails.",
  },
  "famous-route": {
    title: "Famous routes",
    blurb: "Other named long-distance walks across Great Britain, as mapped by OpenStreetMap volunteers.",
  },
  community: {
    title: "Community routes",
    blurb: "Routes uploaded by WhereIWalk members and shared by an admin.",
  },
  "my-route": {
    title: "My routes",
    blurb: "Routes you've uploaded. Only you can see them unless an admin shares them with everyone.",
  },
};

const byProgress = (a: { covered_m: number; length_m: number; name: string }, b: typeof a) =>
  b.covered_m / b.length_m - a.covered_m / a.length_m || a.name.localeCompare(b.name);

/** Group trail summaries by category, and multi-stretch routes by series. */
export function groupTrails(trails: TrailSummary[]): CategoryGroup[] {
  const order: TrailSummary["category"][] = ["national-trail", "coast-path", "famous-route", "community", "my-route"];
  return order
    .map((category) => {
      const inCat = trails.filter((t) => t.category === category);
      const seriesNames = [...new Set(inCat.filter((t) => t.series).map((t) => t.series!))];
      const series = seriesNames.map((name) => {
        // Walked stretches first (most complete first), then the rest alphabetically.
        const ts = inCat.filter((t) => t.series === name).sort(byProgress);
        return {
          name,
          trails: ts,
          length_m: ts.reduce((s, t) => s + t.length_m, 0),
          covered_m: ts.reduce((s, t) => s + t.covered_m, 0),
        };
      });
      const standalone = inCat.filter((t) => !t.series).sort(byProgress);
      return {
        category,
        ...CATEGORY_INFO[category],
        trails: standalone,
        series,
        count: standalone.length + series.length,
        started: standalone.filter((t) => t.covered_m > 0).length + series.filter((g) => g.covered_m > 0).length,
        length_m: inCat.reduce((s, t) => s + t.length_m, 0),
        covered_m: inCat.reduce((s, t) => s + t.covered_m, 0),
      };
    })
    .filter((g) => g.count > 0);
}

/** A series group's stretch list opens automatically once any stretch has been walked. */
export const seriesOpenByDefault = (s: SeriesGroup) => s.covered_m > 0;

/**
 * "Walked only" view: keep only trails (and series stretches) with some progress.
 * Category totals are left unchanged so the summary still describes the whole section.
 */
export function onlyWalked(groups: CategoryGroup[]): CategoryGroup[] {
  return groups.map((g) => ({
    ...g,
    trails: g.trails.filter((t) => t.covered_m > 0),
    series: g.series
      .filter((s) => s.covered_m > 0)
      .map((s) => ({ ...s, trails: s.trails.filter((t) => t.covered_m > 0) })),
  }));
}

/** Rows shown in a group: stand-alone trails plus series. */
export const shownCount = (g: CategoryGroup) => g.trails.length + g.series.length;
