import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { upsertUserByEmail } from "./lib/users-db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
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
