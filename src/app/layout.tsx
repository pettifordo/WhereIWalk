import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhereIWalk",
  description: "Your walks on a map of the UK, and how much of each National Trail you've done.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;

  return (
    <html lang="en-GB">
      <body>
        <header className="header">
          <Link href="/" className="brand">
            Where<span>I</span>Walk
          </Link>
          {user && (
            <>
              <nav className="nav">
                <Link href="/">Map</Link>
                <Link href="/import">Import</Link>
                <Link href="/activities">Activities</Link>
              </nav>
              <form
                className="account"
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/signin" });
                }}
              >
                <span className="muted small">{user.name ?? user.email}</span>
                <button type="submit" className="small">Sign out</button>
              </form>
            </>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
