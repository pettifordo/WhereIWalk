import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { devLoginEnabled } from "./lib/allowlist";
import { canSignIn } from "./lib/invites";
import { upsertUserByEmail } from "./lib/users-db";

const providers: NextAuthConfig["providers"] = [...authConfig.providers];
if (devLoginEnabled()) {
  // Local testing only (never on Vercel): sign in as any admin/invited email without Google.
  providers.push(
    Credentials({
      id: "dev",
      name: "Test login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: async (c) => {
        const email = String(c?.email ?? "").toLowerCase();
        return (await canSignIn(email)) ? { email, name: email.split("@")[0] } : null;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile?.email_verified !== true) return false;
      return canSignIn(user.email);
    },
    async jwt({ token, user }) {
      // `user` is only present at sign-in: record them and remember their id.
      if (user?.email) {
        token.uid = await upsertUserByEmail(user.email, user.name ?? null);
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "number") session.user.id = String(token.uid);
      return session;
    },
  },
});
