import Link from "next/link";
import { connection } from "next/server";
import OverviewMap from "@/components/OverviewMap";
import { attributions, trailSummaries, type TrailSummary } from "@/lib/queries";
import { groupTrails, onlyWalked, seriesOpenByDefault, shownCount } from "@/lib/trail-groups";
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

export default async function Home({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await connection();
  const userId = await requireUserId();
  const { show } = await searchParams;
  const walkedOnly = show === "walked";
  const [trails, attrib] = await Promise.all([trailSummaries(userId), attributions()]);
  const allGroups = groupTrails(trails);
  const groups = walkedOnly ? onlyWalked(allGroups) : allGroups;
  const anything = trails.some((t) => t.covered_m > 0);

  return (
    <main className="split">
      <aside className="sidebar">
        <div className="sidebar-toolbar">
          <nav className="jump-links" aria-label="Jump to section">
            {groups.map((g) => (
              <a key={g.category} href={`#${g.category}`}>
                {g.title} <span className="muted">({shownCount(g)})</span>
              </a>
            ))}
          </nav>
          <div className="segmented" role="group" aria-label="Which routes to list">
            <Link href="/" aria-current={!walkedOnly ? "true" : undefined} scroll={false}>All routes</Link>
            <Link href="/?show=walked" aria-current={walkedOnly ? "true" : undefined} scroll={false}>Walked only</Link>
          </div>
        </div>

        {!anything && (
          <p className="muted small">
            Nothing walked yet. <Link href="/import">Import your activities</Link> to see your progress, or read{" "}
            <Link href="/about">how it works</Link>.
          </p>
        )}

        {groups.map((g) => (
          <section key={g.category} id={g.category} className="trail-group">
            <h2>{g.title}</h2>
            <p className="muted small" style={{ marginTop: 0 }}>{g.blurb}</p>
            <div className="stats">
              <div className="stat"><b>{km(g.covered_m)} km</b><span className="muted small">of {km(g.length_m)} km walked</span></div>
              <div className="stat"><b>{g.started}/{g.count}</b><span className="muted small">started</span></div>
            </div>
            {shownCount(g) === 0 ? (
              <p className="muted small">
                You haven&apos;t walked any of these yet. <Link href="/" scroll={false}>Show all routes</Link>
              </p>
            ) : (
              <ul className="trail-list">
                {g.trails.map((t) => (
                  <li key={t.id}><Progress name={t.name} href={trailHref(t)} covered={t.covered_m} length={t.length_m} /></li>
                ))}
                {g.series.map((s) => {
                  const total = allGroups.find((x) => x.category === g.category)?.series.find((x) => x.name === s.name)?.trails.length ?? s.trails.length;
                  return (
                    <li key={s.name}>
                      <details className="series" open={walkedOnly || seriesOpenByDefault(s)}>
                        <summary>
                          <Progress name={s.name} covered={s.covered_m} length={s.length_m} />
                          <span className="series-toggle muted small">
                            {walkedOnly ? `${s.trails.length} of ${total} stretches walked` : `${total} stretches`}
                          </span>
                        </summary>
                        <ul className="trail-list nested">
                          {s.trails.map((t) => (
                            <li key={t.id}><Progress name={t.name} href={trailHref(t)} covered={t.covered_m} length={t.length_m} /></li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
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
