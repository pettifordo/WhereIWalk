import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Everything except the sign-in page and Auth.js's own routes needs a signed-in
 * session. Pages redirect to /signin; API calls get 401. Whether the person is
 * still invited is checked against the database by every page and API route
 * (src/lib/user.ts), so removing an invite takes effect on their next request.
 */
export const proxy = auth((req) => {
  if (req.auth?.user?.email) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/signin", req.nextUrl));
});

export const config = {
  matcher: ["/((?!signin|api/auth|_next/static|_next/image|maplibre/|favicon.ico|icon.svg|apple-icon.png).*)"],
};
