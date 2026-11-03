import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAllowed } from "./allowlist";

export { upsertUserByEmail, LEGACY_OWNER_EMAIL } from "./users-db";

/** The signed-in user's id, or null. */
export async function currentUserId(): Promise<number | null> {
  const session = await auth();
  if (!isAllowed(session?.user?.email)) return null;
  const id = Number(session?.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** For pages: the signed-in user's id, or send them to the sign-in page. */
export async function requireUserId(): Promise<number> {
  const id = await currentUserId();
  if (id === null) redirect("/signin");
  return id;
}

/** For API routes: the signed-in user's id, or null (caller returns 401). */
export const apiUserId = currentUserId;
