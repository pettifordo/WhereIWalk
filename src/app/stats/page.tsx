import Link from "next/link";
import { connection } from "next/server";
import BarChart from "@/components/BarChart";
import BragSheetButton from "@/components/BragSheetButton";
import { getStats, monthName } from "@/lib/stats";
import { currentUser, requireUserId } from "@/lib/user";
import { date, km, pct } from "@/lib/format";

export const metadata = { title: "Your stats · WhereIWalk" };

const kmFmt = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: v < 10 ? 1 : 0 });
const coord = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`;

export default async function StatsPage() {
  await connection();
  const userId = await requireUserId();
  const [s, me] = await Promise.all([getStats(userId), currentUser()]);

  if (s.walks === 0) {
    return (
      <main className="page">
        <h1>Your stats</h1>
        <p>No walks yet. <Link href="/import">Import your activities</Link> and your stats will appear here.</p>
      </main>
    );
  }

  const firstName = me?.name?.split(" ")[0] ?? null;

  return (
    <main className="page">
      <div className="page-actions">
        <h1 style={{ margin: 0 }}>Your stats</h1>
        <BragSheetButton stats={s} name={me?.name ?? me?.email ?? "Walker"} />
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        {firstName ? `${firstName}, you've` : "You've"} been walking since {date(s.firstWalk)}. Most recent walk: {date(s.lastWalk)}.
      </p>

      <div className="hero-tiles">
        <div className="hero-tile"><div className="v">{kmFmt(s.totalKm)} km</div><div className="k">walked in total</div><div className="s">{kmFmt(s.totalKm / 1.609344)} miles</div></div>
        <div className="hero-tile"><div className="v">{s.walks.toLocaleString("en-GB")}</div><div className="k">walks</div><div className="s">average {kmFmt(s.averageKm)} km</div></div>
        <div className="hero-tile"><div className="v">{kmFmt(s.routeKmUnique)} km</div><div className="k">walked on routes</div><div className="s">overlapping routes counted once (approx.)</div></div>
        <div className="hero-tile"><div className="v">{s.routesStarted}</div><div className="k">routes started</div><div className="s">{s.routesCompleted.length} completed</div></div>
      </div>

      <div className="stats-grid">
        <section className="card">
          <BarChart
            title="Distance by year"
            unit="km"
            format={kmFmt}
            bars={s.byYear.map((y) => ({ label: String(y.year), value: y.km, detail: `${y.walks} walk${y.walks === 1 ? "" : "s"}` }))}
          />
        </section>
        <section className="card">
          <BarChart
            title="Distance by month (all years)"
            unit="km"
            format={kmFmt}
            bars={s.byMonth.map((m) => ({ label: monthName(m.month), value: m.km, detail: `${m.walks} walk${m.walks === 1 ? "" : "s"}` }))}
          />
        </section>

        <section className="card">
          <h2>Records</h2>
          <ul className="kv">
            {s.longestWalk && (
              <li><span>Longest walk</span><span>{kmFmt(s.longestWalk.km)} km<br /><span className="muted small">{s.longestWalk.name ?? "Untitled"}, {date(s.longestWalk.date)}</span></span></li>
            )}
            {s.bestMonth && <li><span>Best month</span><span>{s.bestMonth.label} · {kmFmt(s.bestMonth.km)} km</span></li>}
            <li><span>Longest streak</span><span>{s.longestStreakDays} day{s.longestStreakDays === 1 ? "" : "s"} in a row</span></li>
            <li><span>Days out walking</span><span>{s.daysWalked.toLocaleString("en-GB")}</span></li>
            <li><span>OS 10 km grid squares visited</span><span>{s.gridSquares.toLocaleString("en-GB")}</span></li>
            {s.mostWalkedRoute && (
              <li><span>Most-walked route</span><span><Link href={`/trails/${s.mostWalkedRoute.slug}`}>{s.mostWalkedRoute.name}</Link><br /><span className="muted small">{km(s.mostWalkedRoute.covered_m)} km · {pct(s.mostWalkedRoute.covered_m, s.mostWalkedRoute.length_m)}%</span></span></li>
            )}
          </ul>
        </section>

        <section className="card">
          <h2>Compass points</h2>
          <p className="muted small" style={{ marginTop: 0 }}>The furthest you&apos;ve walked in each direction.</p>
          <ul className="kv">
            {s.extremes.map((e) => (
              <li key={e.label}>
                <span>Furthest {e.label.toLowerCase()}</span>
                <span>{coord(e.lat, e.lon)}<br /><span className="muted small">{e.walk ?? "Untitled"}, {date(e.date)}</span></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Routes</h2>
          <ul className="kv">
            {s.groups.map((g) => (
              <li key={g.category}>
                <span>{g.title}</span>
                <span>{km(g.covered_m)} of {km(g.length_m)} km<br /><span className="muted small">{g.started}/{g.count} started · {pct(g.covered_m, g.length_m)}%</span></span>
              </li>
            ))}
          </ul>
          {s.routesCompleted.length > 0 && (
            <>
              <h3 style={{ marginBottom: 4 }}>Completed</h3>
              <p className="small" style={{ marginTop: 0 }}>{s.routesCompleted.map((t) => t.name).join(", ")}</p>
            </>
          )}
          <p className="small"><Link href="/?show=walked">See your routes on the map →</Link></p>
        </section>

        <section className="card">
          <h2>Activity types</h2>
          <ul className="kv">
            {s.byType.map((t) => (
              <li key={t.type}><span>{t.type}</span><span>{t.walks} · {kmFmt(t.km)} km</span></li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
