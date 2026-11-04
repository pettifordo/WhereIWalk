import { NextResponse, type NextRequest } from "next/server";
import { findSimilarRoutes, validateRouteUpload } from "@/lib/user-routes";
import { apiUserId } from "@/lib/user";

/** Before saving an upload: how long is it, and does it follow routes the user can already see? */
export async function POST(request: NextRequest) {
  const userId = await apiUserId();
  if (userId === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const r = validateRouteUpload(await request.json());
    return NextResponse.json(await findSimilarRoutes(userId, r.lines));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
