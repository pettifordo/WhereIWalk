import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";
import { isAllowed } from "./lib/allowlist";

const { auth } = NextAuth(authConfig);

/**
 * Everything except the sign-in page and Auth.js's own routes needs a signed-in
 * user. Pages redirect to /signin; API calls get 401.
 */
export const proxy = auth((req) => {
  // Re-check the invite list on every request, so removing an email locks them out at once.
  if (req.auth && isAllowed(req.auth.user?.email)) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/signin", req.nextUrl));
});

export const config = {
  matcher: ["/((?!signin|api/auth|_next/static|_next/image|maplibre/|favicon.ico).*)"],
};
