import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET() {
  const modelUrl = (process.env.MODEL_SERVER_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const [mongo, model] = await Promise.allSettled([
    getDb().then(async (db) => { await db.command({ ping: 1 }); return true; }),
    fetch(`${modelUrl}/ready`, { cache: "no-store", signal: AbortSignal.timeout(2500) })
      .then((response) => response.ok),
  ]);
  const mongoReady = mongo.status === "fulfilled";
  const modelReady = model.status === "fulfilled" && model.value;
  return NextResponse.json({
    status: mongoReady && modelReady ? "ready" : "degraded",
    dashboard: "ready",
    mongodb: mongoReady ? "ready" : "unavailable",
    modelServer: modelReady ? "ready" : "unavailable",
    modelServerUrl: modelUrl,
    checkedAt: new Date().toISOString(),
  }, { status: mongoReady && modelReady ? 200 : 503 });
}
