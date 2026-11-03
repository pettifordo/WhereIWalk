import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "./allowlist";
import { canSignIn } from "./invites";

export { upsertUserByEmail, LEGACY_OWNER_EMAIL } from "./users-db";

export interface CurrentUser {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

/** The signed-in user, if they're still an admin or invited; otherwise null. */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  const id = Number(session?.user?.id);
  if (!email || !Number.isInteger(id) || id <= 0) return null;
  if (!(await canSignIn(email))) return null;
  return { id, email, name: session?.user?.name ?? null, isAdmin: isAdminEmail(email) };
}

export async function currentUserId(): Promise<number | null> {
  return (await currentUser())?.id ?? null;
}

/** For pages: the signed-in user's id, or send them to the sign-in page. */
export async function requireUserId(): Promise<number> {
  const id = await currentUserId();
  if (id === null) redirect("/signin");
  return id;
}

/** For admin pages and actions: the signed-in admin, or send others away. */
export async function requireAdmin(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect("/signin");
  if (!u.isAdmin) redirect("/");
  return u;
}

/** For API routes: the signed-in user's id, or null (caller returns 401). */
export const apiUserId = currentUserId;
