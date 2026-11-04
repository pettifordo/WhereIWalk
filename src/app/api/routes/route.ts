import { NextResponse, type NextRequest } from "next/server";
import { createUserRoute, listMyRoutes, validateRouteUpload } from "@/lib/user-routes";
import { apiUserId, currentUser } from "@/lib/user";

export const maxDuration = 60;

export async function GET() {
  const userId = await apiUserId();
  if (userId === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(await listMyRoutes(userId));
}

export async function POST(request: NextRequest) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let upload;
  try {
    upload = validateRouteUpload(await request.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  try {
    const slug = await createUserRoute(me.id, me.name ?? me.email.split("@")[0], upload);
    return NextResponse.json({ slug });
  } catch (e) {
    const msg = (e as Error).message;
    // Validation-style errors from createUserRoute are safe to show.
    if (/at least|at most/.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    throw e;
  }
}
