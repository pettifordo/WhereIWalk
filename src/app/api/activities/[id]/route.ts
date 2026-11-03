import { NextResponse } from "next/server";
import { deleteActivity } from "@/lib/activities";
import { getCurrentUserId } from "@/lib/user";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const userId = await getCurrentUserId();
  const ok = await deleteActivity(userId, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
