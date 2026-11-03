import type { Metadata } from "next";
import Link from "next/link";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhereIWalk",
  description: "Your walks on a map of the UK, and how much of each National Trail you've done.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <header className="header">
          <Link href="/" className="brand">
            Where<span>I</span>Walk
          </Link>
          <nav className="nav">
            <Link href="/">Map</Link>
            <Link href="/import">Import</Link>
            <Link href="/activities">Activities</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
