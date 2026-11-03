import { NextResponse } from "next/server";
import { coveredOverview, tracksOverview, trailsOverview } from "@/lib/queries";
import { apiUserId } from "@/lib/user";

export async function GET() {
  const userId = await apiUserId();
  if (userId === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const [trails, covered, tracks] = await Promise.all([
    trailsOverview(),
    coveredOverview(userId),
    tracksOverview(userId),
  ]);
  return NextResponse.json({ trails, covered, tracks }, { headers: { "Cache-Control": "private, no-store" } });
}
