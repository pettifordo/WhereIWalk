import ImportPanel from "@/components/ImportPanel";

export default function ImportPage() {
  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <h1>Import activities</h1>
      <p>
        The easiest way to bring in all your history is Strava&apos;s bulk export. On strava.com, open{" "}
        <strong>Settings → My Account</strong> and look for the option to download your data (&ldquo;request your
        archive&rdquo;). Strava emails you a link to a ZIP file, which can take a while; drop that ZIP below.
      </p>
      <p className="muted small">
        Your files are read in your browser. Only a simplified copy of each GPS track (plus its name, type and date) is
        sent to WhereIWalk. Importing the same activity twice is safe; duplicates are skipped.
      </p>
      <ImportPanel />
    </main>
  );
}
