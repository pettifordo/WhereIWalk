import { NextResponse } from "next/server";
import { coveredOverview, tracksOverview, trailsOverview } from "@/lib/queries";
import { getCurrentUserId } from "@/lib/user";

export async function GET() {
  const userId = await getCurrentUserId();
  const [trails, covered, tracks] = await Promise.all([
    trailsOverview(),
    coveredOverview(userId),
    tracksOverview(userId),
  ]);
  return NextResponse.json({ trails, covered, tracks }, { headers: { "Cache-Control": "private, no-store" } });
}
