import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/auth";
import { currentUser } from "@/lib/user";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhereIWalk",
  description: "Your walks on a map of the UK, and how much of each National Trail you've done.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <html lang="en-GB">
      <body>
        <header className="header">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={24} height={24} />
            <span>Where<span className="brand-i">I</span>Walk</span>
          </Link>
          {user && (
            <>
              <nav className="nav">
                <Link href="/">Map</Link>
                <Link href="/import">Import</Link>
                <Link href="/activities">Activities</Link>
                {user.isAdmin && <Link href="/invites">Invites</Link>}
                <Link href="/about">How it works</Link>
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
          {!user && (
            <nav className="nav" style={{ marginLeft: "auto" }}>
              <Link href="/about">How it works</Link>
              <Link href="/signin">Sign in</Link>
            </nav>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
