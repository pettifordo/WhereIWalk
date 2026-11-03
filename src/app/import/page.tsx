import Link from "next/link";
import ImportPanel from "@/components/ImportPanel";

export default function ImportPage() {
  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <h1>Import activities</h1>
      <p>Drop a Strava export ZIP, or GPX, TCX or FIT files, into the box below.</p>
      <ImportPanel />

      <section className="prose" style={{ marginTop: 28 }}>
        <h2>Getting your Strava export</h2>
        <p>
          Strava can send you a ZIP file of all your activities. You can only request it on the Strava{" "}
          <strong>website</strong> (strava.com), not in the phone app.
        </p>
        <ol>
          <li>
            Sign in at <a href="https://www.strava.com" target="_blank" rel="noreferrer">strava.com</a> in a web
            browser (easiest on a computer).
          </li>
          <li>Hover over your name or picture in the top-right corner and choose <strong>Settings</strong>.</li>
          <li>Choose <strong>My Account</strong> from the menu on the left.</li>
          <li>Under <strong>Download your account</strong>, select <strong>Get Started</strong>.</li>
          <li>
            On the next page, select <strong>Request download</strong>. Don&apos;t press anything about deleting your
            account.
          </li>
          <li>
            Strava emails a download link to the email address on your Strava account. Strava says this can take a few
            hours.
          </li>
          <li>
            Download the ZIP from the email and drop it into the box above. You don&apos;t need to unzip it first.
          </li>
        </ol>
        <p className="muted small">
          These steps follow Strava&apos;s help article{" "}
          <a
            href="https://support.strava.com/en-us/articles/15401919-how-do-i-export-my-strava-data"
            target="_blank"
            rel="noreferrer"
          >
            How do I export my Strava data?
          </a>{" "}
          (updated September 2026). If Strava&apos;s menus look different, check that article.
        </p>

        <h2>Good to know</h2>
        <ul>
          <li>
            <strong>Importing again later is safe.</strong> Activities you&apos;ve already imported are skipped, so you
            can drop in a newer export and only the new walks are added.
          </li>
          <li>
            <strong>Only activities with GPS tracks in Great Britain are used.</strong> Indoor activities and trips
            abroad are skipped and counted in the summary.
          </li>
          <li>
            <strong>Just one walk?</strong> On Strava, open the activity, click the <strong>…</strong> menu and choose{" "}
            <strong>Export GPX</strong>, then drop that file here.
          </li>
          <li>
            <strong>Very large export?</strong> The ZIP is read in your browser, so a big history can take a few
            minutes. If your browser struggles, unzip it and drop the files from its <code>activities</code> folder
            instead, in batches if needed.
          </li>
          <li>
            <strong>Privacy:</strong> your files are read in your browser. Only a simplified copy of each GPS track,
            with its name, type and date, is sent to WhereIWalk. <Link href="/about">More about how it works</Link>.
          </li>
        </ul>
      </section>
    </main>
  );
}
