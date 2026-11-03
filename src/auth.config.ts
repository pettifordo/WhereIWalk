// Auth settings that don't touch the database, so they can run in src/proxy.ts.
// The full setup (which records users in Postgres) is in src/auth.ts.
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { devLoginEnabled, isAllowed } from "./lib/allowlist";

const providers: NextAuthConfig["providers"] = [Google];

if (devLoginEnabled()) {
  // Local testing only: sign in as any allowed email without Google.
  providers.push(
    Credentials({
      id: "dev",
      name: "Test login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: (c) => {
        const email = String(c?.email ?? "").toLowerCase();
        return isAllowed(email) ? { email, name: email.split("@")[0] } : null;
      },
    }),
  );
}

export default {
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile?.email_verified !== true) return false;
      return isAllowed(user.email);
    },
  },
} satisfies NextAuthConfig;
