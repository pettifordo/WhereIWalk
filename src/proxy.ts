import { NextResponse, type NextRequest } from "next/server";

/**
 * Phase 1 login: HTTP Basic auth over the whole site, using APP_USERNAME and
 * APP_PASSWORD. If neither is set the site is open; that is only allowed
 * outside production, so a deploy without them is locked rather than public.
 */
export function proxy(request: NextRequest) {
  const user = process.env.APP_USERNAME ?? "";
  const pass = process.env.APP_PASSWORD ?? "";
  if (!user && !pass) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Login is not configured: set APP_USERNAME and APP_PASSWORD.", { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      if (i >= 0 && safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass)) {
        return NextResponse.next();
      }
    } catch {
      // malformed header: fall through to 401
    }
  }
  return new NextResponse("Login required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="WhereIWalk", charset="UTF-8"' },
  });
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
