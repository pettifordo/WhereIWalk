import { NextResponse, type NextRequest } from "next/server";
import { MAX_ACTIVITIES_PER_REQUEST, insertActivities, listActivities, validateUpload } from "@/lib/activities";
import { apiUserId } from "@/lib/user";

// Matching a batch against ~47k trail segments can take a few seconds.
export const maxDuration = 60;

export async function GET() {
  const userId = await apiUserId();
  if (userId === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(await listActivities(userId));
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const list = (body as { activities?: unknown })?.activities;
  if (!Array.isArray(list) || list.length === 0) {
    return NextResponse.json({ error: "activities[] required" }, { status: 400 });
  }
  if (list.length > MAX_ACTIVITIES_PER_REQUEST) {
    return NextResponse.json({ error: `At most ${MAX_ACTIVITIES_PER_REQUEST} activities per request` }, { status: 413 });
  }
  let uploads;
  try {
    uploads = list.map(validateUpload);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const userId = await apiUserId();
  if (userId === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(await insertActivities(userId, uploads));
}
