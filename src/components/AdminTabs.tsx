import Link from "next/link";

/** Tabs across the admin pages. */
export default function AdminTabs({ active }: { active: "invites" | "routes" }) {
  return (
    <nav className="segmented" aria-label="Admin pages" style={{ marginBottom: 16 }}>
      <Link href="/invites" aria-current={active === "invites" ? "true" : undefined}>Invites</Link>
      <Link href="/admin/routes" aria-current={active === "routes" ? "true" : undefined}>Community routes</Link>
    </nav>
  );
}
