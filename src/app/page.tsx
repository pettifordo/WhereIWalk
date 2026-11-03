import Link from "next/link";
import { connection } from "next/server";
import OverviewMap from "@/components/OverviewMap";
import { attributions, trailSummaries, type TrailSummary } from "@/lib/queries";
import { groupTrails } from "@/lib/trail-groups";
import { requireUserId } from "@/lib/user";
import { km, pct } from "@/lib/format";

function Progress({ name, href, covered, length }: { name: string; href?: string; covered: number; length: number }) {
  const body = (
    <>
      <div className="trail-row">
        <span>{name}</span>
        <span className="muted">{pct(covered, length)}%</span>
      </div>
      <div className="bar"><div style={{ width: `${pct(covered, length)}%` }} /></div>
      <div className="muted small" style={{ marginTop: 4 }}>{km(covered)} / {km(length)} km</div>
    </>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const trailHref = (t: TrailSummary) => `/trails/${t.slug}`;

export default async function Home() {
  await connection();
  const userId = await requireUserId();
  const [trails, attrib] = await Promise.all([trailSummaries(userId), attributions()]);
  const groups = groupTrails(trails);
  const anything = trails.some((t) => t.covered_m > 0);

  return (
    <main className="split">
      <aside className="sidebar">
        {!anything && (
          <p className="muted small">
            Nothing walked yet. <Link href="/import">Import your activities</Link> to see your progress, or read{" "}
            <Link href="/about">how it works</Link>.
          </p>
        )}
        {groups.map((g) => (
          <section key={g.category} className="trail-group">
            <h2>{g.title}</h2>
            <p className="muted small" style={{ marginTop: 0 }}>{g.blurb}</p>
            <div className="stats">
              <div className="stat"><b>{km(g.covered_m)} km</b><span className="muted small">of {km(g.length_m)} km walked</span></div>
              <div className="stat"><b>{g.started}/{g.count}</b><span className="muted small">started</span></div>
            </div>
            <ul className="trail-list">
              {g.trails.map((t) => (
                <li key={t.id}><Progress name={t.name} href={trailHref(t)} covered={t.covered_m} length={t.length_m} /></li>
              ))}
              {g.series.map((s) => (
                <li key={s.name}>
                  <details className="series">
                    <summary>
                      <Progress name={s.name} covered={s.covered_m} length={s.length_m} />
                      <span className="muted small">{s.trails.length} stretches — show</span>
                    </summary>
                    <ul className="trail-list nested">
                      {s.trails.map((t) => (
                        <li key={t.id}><Progress name={t.name} href={trailHref(t)} covered={t.covered_m} length={t.length_m} /></li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="attribution">
          {attrib.map((a) => <div key={a}>Trail data: {a} Open Government Licence v3.0.</div>)}
          <div><Link href="/about">About the data and how matching works</Link></div>
        </div>
      </aside>
      <OverviewMap />
    </main>
  );
}
