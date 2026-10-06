import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { endSession } from "@/lib/episodes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let sessionId: string | undefined;
  try {
    const body = await request.json();
    if (body && typeof body.sessionId === "string") sessionId = body.sessionId;
  } catch {
    // Empty body is allowed and closes any remaining local session episodes.
  }
  try {
    const db = await getDb();
    const closedEpisodes = await endSession(db, sessionId);
    return NextResponse.json({ closedEpisodes });
  } catch (error) {
    console.error("Unable to close monitoring episodes", error);
    return NextResponse.json({ detail: "Database is unavailable." }, { status: 503 });
  }
}
