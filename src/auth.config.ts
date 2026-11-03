// Auth settings shared with src/proxy.ts. Kept free of database code; the full
// setup (invite checks, recording users) is in src/auth.ts.
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export default {
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
} satisfies NextAuthConfig;
