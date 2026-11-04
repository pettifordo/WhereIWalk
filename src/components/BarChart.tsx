// A small single-series vertical bar chart in plain HTML/CSS (no chart library).
// Each bar shows its value on hover/focus; a table view is provided for screen
// readers and anyone who prefers numbers.
export interface Bar { label: string; value: number; detail?: string }

export default function BarChart({
  title,
  bars,
  unit,
  format = (v) => v.toLocaleString("en-GB", { maximumFractionDigits: 0 }),
}: {
  title: string;
  bars: Bar[];
  unit: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(...bars.map((b) => b.value), 0);
  return (
    <figure className="barchart">
      <figcaption>{title}</figcaption>
      <div className="barchart-plot" role="img" aria-label={`${title}: ${bars.map((b) => `${b.label} ${format(b.value)} ${unit}`).join(", ")}`}>
        {bars.map((b) => (
          <div key={b.label} className="barchart-col" tabIndex={0}>
            <div className="barchart-tip" role="tooltip">
              <strong>{b.label}</strong> {format(b.value)} {unit}
              {b.detail && <span className="muted"> · {b.detail}</span>}
            </div>
            <div className="barchart-track">
              <div className="barchart-bar" style={{ height: max ? `${Math.max((b.value / max) * 100, b.value > 0 ? 2 : 0)}%` : 0 }} />
            </div>
            <div className="barchart-label">{b.label}</div>
          </div>
        ))}
      </div>
      <details className="small">
        <summary className="muted">Show as table</summary>
        <table>
          <tbody>
            {bars.map((b) => (
              <tr key={b.label}><td>{b.label}</td><td className="num">{format(b.value)} {unit}</td><td className="muted">{b.detail}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
