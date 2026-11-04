import { query } from "./db";
import { trailSummaries, visibleTo, type TrailSummary } from "./queries";
import { groupTrails, type CategoryGroup } from "./trail-groups";

export interface WalkRef { id: number; name: string | null; date: string | null; km: number }
export interface Extreme { label: string; lat: number; lon: number; walk: string | null; date: string | null }

export interface Stats {
  walks: number;
  totalKm: number;
  firstWalk: string | null;
  lastWalk: string | null;
  daysWalked: number;
  longestStreakDays: number;
  longestWalk: WalkRef | null;
  averageKm: number;
  byYear: { year: number; km: number; walks: number }[];
  byMonth: { month: number; km: number; walks: number }[];
  byType: { type: string; walks: number; km: number }[];
  bestMonth: { label: string; km: number } | null;
  extremes: Extreme[];
  gridSquares: number;
  /** Distance of official/route network walked, counting overlapping routes once. */
  routeKmUnique: number;
  routesStarted: number;
  routesCompleted: TrailSummary[];
  mostWalkedRoute: TrailSummary | null;
  groups: CategoryGroup[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (m: number) => MONTHS[m - 1];
/** A route counts as completed at 99% (allowing for small mapping differences). */
export const COMPLETED_FRACTION = 0.99;

export async function getStats(userId: number): Promise<Stats> {
  const [totals] = await query<{
    walks: number; km: number; first: string | null; last: string | null; days: number;
  }>(
    `SELECT count(*)::int AS walks, COALESCE(sum(distance_m), 0)::float8 / 1000 AS km,
            min(start_time)::text AS first, max(start_time)::text AS last,
            count(DISTINCT (start_time AT TIME ZONE 'Europe/London')::date)::int AS days
     FROM activities WHERE user_id = $1`,
    [userId],
  );

  const [longest] = await query<WalkRef>(
    `SELECT id::int, name, start_time::text AS date, distance_m::float8 / 1000 AS km
     FROM activities WHERE user_id = $1 ORDER BY distance_m DESC LIMIT 1`,
    [userId],
  );

  const byYear = await query<{ year: number; km: number; walks: number }>(
    `SELECT extract(year FROM start_time AT TIME ZONE 'Europe/London')::int AS year,
            sum(distance_m)::float8 / 1000 AS km, count(*)::int AS walks
     FROM activities WHERE user_id = $1 AND start_time IS NOT NULL GROUP BY 1 ORDER BY 1`,
    [userId],
  );

  const byMonthRows = await query<{ month: number; km: number; walks: number }>(
    `SELECT extract(month FROM start_time AT TIME ZONE 'Europe/London')::int AS month,
            sum(distance_m)::float8 / 1000 AS km, count(*)::int AS walks
     FROM activities WHERE user_id = $1 AND start_time IS NOT NULL GROUP BY 1`,
    [userId],
  );
  const byMonth = Array.from({ length: 12 }, (_, i) => byMonthRows.find((r) => r.month === i + 1) ?? { month: i + 1, km: 0, walks: 0 });

  const [best] = await query<{ y: number; m: number; km: number }>(
    `SELECT extract(year FROM t)::int AS y, extract(month FROM t)::int AS m, sum(distance_m)::float8 / 1000 AS km
     FROM (SELECT start_time AT TIME ZONE 'Europe/London' AS t, distance_m FROM activities
           WHERE user_id = $1 AND start_time IS NOT NULL) a
     GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 1`,
    [userId],
  );

  const byType = await query<{ type: string; walks: number; km: number }>(
    `SELECT COALESCE(NULLIF(trim(activity_type), ''), 'Other') AS type, count(*)::int AS walks,
            sum(distance_m)::float8 / 1000 AS km
     FROM activities WHERE user_id = $1 GROUP BY 1 ORDER BY 3 DESC`,
    [userId],
  );

  // Longest run of consecutive days with at least one walk (gaps and islands).
  const [streak] = await query<{ days: number }>(
    `WITH d AS (SELECT DISTINCT (start_time AT TIME ZONE 'Europe/London')::date AS day
                FROM activities WHERE user_id = $1 AND start_time IS NOT NULL),
          g AS (SELECT day, day - (row_number() OVER (ORDER BY day))::int AS grp FROM d)
     SELECT COALESCE(max(n), 0)::int AS days FROM (SELECT count(*) AS n FROM g GROUP BY grp) x`,
    [userId],
  );

  // Furthest north/south/east/west points reached.
  const extremesRows = await query<{ dir: string; lat: number; lon: number; walk: string | null; date: string | null }>(
    `WITH p AS (
       SELECT a.name, a.start_time, (ST_DumpPoints(a.geom)).geom AS pt FROM activities a WHERE a.user_id = $1
     ), r AS (
       (SELECT 'North' AS dir, * FROM p ORDER BY ST_Y(pt) DESC LIMIT 1) UNION ALL
       (SELECT 'South', * FROM p ORDER BY ST_Y(pt) ASC LIMIT 1) UNION ALL
       (SELECT 'East', * FROM p ORDER BY ST_X(pt) DESC LIMIT 1) UNION ALL
       (SELECT 'West', * FROM p ORDER BY ST_X(pt) ASC LIMIT 1)
     )
     SELECT dir, ST_Y(pt) AS lat, ST_X(pt) AS lon, name AS walk, start_time::text AS date FROM r`,
    [userId],
  );
  const extremes = extremesRows.map((r) => ({ label: r.dir, lat: r.lat, lon: r.lon, walk: r.walk, date: r.date }));

  // Ordnance Survey 10 km grid squares your tracks pass through.
  const [grid] = await query<{ n: number }>(
    `SELECT count(DISTINCT (floor(ST_X(pt) / 10000), floor(ST_Y(pt) / 10000)))::int AS n
     FROM (SELECT (ST_DumpPoints(ST_Segmentize(geom_bng, 1000))).geom AS pt FROM activities WHERE user_id = $1) x`,
    [userId],
  );

  // Route network walked, counting overlapping routes once (e.g. SWCP and England Coast Path).
  const [unique] = await query<{ km: number }>(
    `SELECT COALESCE(ST_Area(ST_Union(ST_Buffer(s.geom_bng, 25, 'endcap=flat'))) / 50 / 1000, 0)::float8 AS km
     FROM (SELECT DISTINCT s.id, s.geom_bng FROM segment_coverage c JOIN trail_segments s ON s.id = c.segment_id
           JOIN trails t ON t.id = s.trail_id WHERE c.user_id = $1 AND ${visibleTo("t", "$1")}) s`,
    [userId],
  );

  const trails = await trailSummaries(userId);
  const started = trails.filter((t) => t.covered_m > 0);
  const completed = started.filter((t) => t.covered_m >= COMPLETED_FRACTION * t.length_m);
  const most = [...started].sort((a, b) => b.covered_m - a.covered_m)[0] ?? null;

  return {
    walks: totals.walks,
    totalKm: totals.km,
    firstWalk: totals.first,
    lastWalk: totals.last,
    daysWalked: totals.days,
    longestStreakDays: streak?.days ?? 0,
    longestWalk: longest ?? null,
    averageKm: totals.walks ? totals.km / totals.walks : 0,
    byYear,
    byMonth,
    byType,
    bestMonth: best ? { label: `${monthName(best.m)} ${best.y}`, km: best.km } : null,
    extremes,
    gridSquares: grid?.n ?? 0,
    routeKmUnique: unique?.km ?? 0,
    routesStarted: started.length,
    routesCompleted: completed,
    mostWalkedRoute: most,
    groups: groupTrails(trails),
  };
}
