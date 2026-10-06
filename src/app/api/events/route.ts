import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import type { EpisodeDocument } from "@/lib/episodes";
import type { Document } from "mongodb";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  const requestedSkip = Number(url.searchParams.get("skip") ?? 0);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 200)) : 50;
  const skip = Number.isFinite(requestedSkip) ? Math.max(0, requestedSkip) : 0;
  try {
    const db = await getDb();
    const collection = db.collection<EpisodeDocument & Document>("detectionEvents");
    const [events, total, highTotal] = await Promise.all([
      collection.find({}, { projection: { sessionId: 0 } }).sort({ appearedAt: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments({}),
      collection.countDocuments({ threatLevel: "High" }),
    ]);
    return NextResponse.json({ events: events.map((event) => ({
      id: String(event._id),
      source: event.source,
      className: event.className,
      confidence: event.confidence,
      bbox: event.bbox,
      threatLevel: event.threatLevel,
      appearedAt: event.appearedAt,
      lastSeenAt: event.lastSeenAt,
      endedAt: event.endedAt ?? null,
    })), total, highTotal });
  } catch (error) {
    console.error("Unable to read detection history", error);
    return NextResponse.json({ detail: "Database is unavailable." }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    const db = await getDb();
    const { endSession } = await import("@/lib/episodes");
    await endSession(db);
    const result = await db.collection("detectionEvents").deleteMany({});
    return NextResponse.json({ deleted: result.deletedCount });
  } catch (error) {
    console.error("Unable to delete detection history", error);
    return NextResponse.json({ detail: "Database is unavailable." }, { status: 503 });
  }
}
