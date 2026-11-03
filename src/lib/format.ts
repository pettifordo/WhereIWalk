export const km = (m: number) => (m / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 });
export const miles = (m: number) => (m / 1609.344).toLocaleString("en-GB", { maximumFractionDigits: 1 });
export const pct = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, (part / whole) * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 }) : "0";
export const date = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
