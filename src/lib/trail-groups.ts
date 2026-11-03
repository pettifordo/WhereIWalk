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
};

const byProgress = (a: { covered_m: number; length_m: number; name: string }, b: typeof a) =>
  b.covered_m / b.length_m - a.covered_m / a.length_m || a.name.localeCompare(b.name);

/** Group trail summaries by category, and multi-stretch routes by series. */
export function groupTrails(trails: TrailSummary[]): CategoryGroup[] {
  const order: TrailSummary["category"][] = ["national-trail", "coast-path"];
  return order
    .map((category) => {
      const inCat = trails.filter((t) => t.category === category);
      const seriesNames = [...new Set(inCat.filter((t) => t.series).map((t) => t.series!))];
      const series = seriesNames.map((name) => {
        const ts = inCat.filter((t) => t.series === name).sort((a, b) => a.name.localeCompare(b.name));
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
