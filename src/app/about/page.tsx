import Link from "next/link";
import { connection } from "next/server";
import { query } from "@/lib/db";
import { MIN_COVERED_FRACTION, SEGMENT_LENGTH_M, TOLERANCE_M } from "@/lib/coverage";
import { PRIVACY_TRIM_M } from "@/lib/queries";
import { ENGLAND_COAST_PATH, SOURCES } from "@/lib/trail-sources";
import { km } from "@/lib/format";

export const metadata = { title: "How it works · WhereIWalk" };

interface Row { name: string; slug: string; category: string; series: string | null; length_m: number }

export default async function AboutPage() {
  await connection();
  const trails = await query<Row>(`SELECT name, slug, category, series, length_m FROM trails ORDER BY name`);
  const national = trails.filter((t) => t.category === "national-trail");
  const coast = trails.filter((t) => t.category === "coast-path" && !t.series);
  const ecp = trails.filter((t) => t.series === ENGLAND_COAST_PATH);
  const ecpLength = ecp.reduce((s, t) => s + t.length_m, 0);

  return (
    <main className="page prose" style={{ maxWidth: 760 }}>
      <h1>How WhereIWalk works</h1>
      <p>
        WhereIWalk puts your walks on a map of Great Britain and shows how much of each long-distance route you&apos;ve
        covered: which sections you&apos;ve done, when, and where the gaps are. It&apos;s a free, invite-only app for
        friends and family.
      </p>

      <h2>The routes</h2>
      <h3>National Trails</h3>
      <p>
        National Trails are officially designated long-distance walking routes in England and Wales. Natural England
        and Natural Resources Wales publish their route data. WhereIWalk has {national.length}, totalling{" "}
        {km(national.reduce((s, t) => s + t.length_m, 0))} km:
      </p>
      <ul>
        {national.map((t) => (
          <li key={t.slug}>{t.name} <span className="muted small">({km(t.length_m)} km)</span></li>
        ))}
      </ul>

      <h3>Coast paths</h3>
      <ul>
        {coast.map((t) => (
          <li key={t.slug}>
            <strong>{t.name}</strong> <span className="muted small">({km(t.length_m)} km)</span>, around the coast of
            Wales.
          </li>
        ))}
        {ecp.length > 0 && (
          <li>
            <strong>{ENGLAND_COAST_PATH}</strong>, around the coast of England. Natural England publishes it in{" "}
            {ecp.length} named stretches, which WhereIWalk shows separately and adds up. The data includes{" "}
            {km(ecpLength)} km of main route, without alternative routes. It may not include stretches that aren&apos;t
            published yet.
          </li>
        )}
      </ul>
      <p className="muted small">
        Coast paths overlap some National Trails. In the route data, the Pembrokeshire Coast Path lies entirely along
        the Wales Coast Path, and most of the South West Coast Path lies along the England Coast Path. A walk there
        counts towards both.
      </p>

      <h3>Famous routes (coming later)</h3>
      <p>
        We&apos;d like to add other well-known routes, such as Scotland&apos;s Great Trails and the long-distance paths
        listed by the Long Distance Walkers Association (LDWA). They&apos;ll be added once there&apos;s route data we
        have permission to use.
      </p>

      <h2>How your walks are matched</h2>
      <ul>
        <li>Each route is cut into short pieces of about {SEGMENT_LENGTH_M} m.</li>
        <li>
          A piece counts as walked when at least {Math.round(MIN_COVERED_FRACTION * 100)}% of it is within {TOLERANCE_M}{" "}
          m of one of your GPS tracks. This allows for normal GPS wobble without counting a parallel road or path.
        </li>
        <li>
          Route lengths are measured from the official route data. They can differ a little from guidebooks or
          signposts.
        </li>
        <li>
          Expect some small gaps. Common causes are diversions, ferry and estuary crossings, a GPS that dropped out, and
          places where the official line runs differently from the path on the ground.
        </li>
      </ul>

      <h2>Importing from Strava</h2>
      <p>
        The easiest way to bring in your whole history is Strava&apos;s bulk export. <Link href="/import">The Import
        page</Link> has step-by-step instructions. You can also import GPX, TCX and FIT files from any app or device.
        Importing the same activities again is safe: duplicates are skipped, so you can import a newer export later.
      </p>

      <h2>Privacy</h2>
      <ul>
        <li>Your files are read in your browser. Only a simplified copy of each GPS track is uploaded, with its name, type and date.</li>
        <li>Only you can see your walks and progress. Other people using WhereIWalk can&apos;t see them.</li>
        <li>On the map, the first and last {PRIVACY_TRIM_M} m of each track are hidden so it doesn&apos;t show where you live.</li>
        <li>
          Admins (whoever runs the invite list) can see your email, whether you&apos;ve signed in and how many walks
          you&apos;ve imported, but not the walks themselves.
        </li>
        <li>
          You can delete any walk on the Activities page. To have your account and all your data deleted, ask an admin.
        </li>
      </ul>

      <h2>Data sources</h2>
      <ul className="small">
        {SOURCES.map((s) => (
          <li key={s.id}>
            <strong>{s.label}</strong>: {s.attribution} Used under the Open Government Licence v3.0.
          </li>
        ))}
        <li>
          <strong>Base map</strong>: © OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors.
        </li>
      </ul>
    </main>
  );
}
