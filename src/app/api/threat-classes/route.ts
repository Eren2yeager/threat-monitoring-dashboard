import { NextResponse } from "next/server";
import { isModelClass, isThreatLevel } from "@/lib/classes";
import { getDb } from "@/lib/mongodb";
import { ensureThreatClasses, readThreatLevels } from "@/lib/threats";
import type { ModelClass } from "@/lib/classes";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await getDb();
    const levels = await readThreatLevels(db);
    return NextResponse.json(Object.entries(levels).map(([name, level]) => ({ name, level })));
  } catch (error) {
    console.error("Unable to read class threat settings", error);
    return NextResponse.json({ detail: "Database is unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ detail: "Request body must be valid JSON." }, { status: 400 });
  }

  const updates = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "classes" in payload
      ? (payload as { classes?: unknown }).classes
      : null;
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ detail: "Provide a non-empty classes array." }, { status: 422 });
  }

  const validated = new Map<string, "Low" | "Medium" | "High">();
  for (const entry of updates) {
    if (!entry || typeof entry !== "object" || !("name" in entry) || !("level" in entry)) {
      return NextResponse.json({ detail: "Each update requires name and level." }, { status: 422 });
    }
    const { name, level } = entry as { name: unknown; level: unknown };
    if (!isModelClass(name) || !isThreatLevel(level)) {
      return NextResponse.json({ detail: "Unknown model class or threat level." }, { status: 422 });
    }
    validated.set(name, level);
  }

  try {
    const db = await getDb();
    const collection = await ensureThreatClasses(db);
    for (const [name, level] of validated) {
      await collection.updateOne({ name: name as ModelClass }, { $set: { level, updatedAt: new Date() } }, { upsert: true });
    }
    const rows = await collection.find({}, { projection: { name: 1, level: 1 } }).toArray();
    return NextResponse.json(rows.map(({ name, level }) => ({ name, level })));
  } catch (error) {
    console.error("Unable to update class threat settings", error);
    return NextResponse.json({ detail: "Database is unavailable." }, { status: 503 });
  }
}
