import { NextResponse } from "next/server";
import { isModelClass } from "@/lib/classes";
import { getDb } from "@/lib/mongodb";
import { recordFrameDetections, type DetectionInput } from "@/lib/episodes";
import { readThreatLevels } from "@/lib/threats";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FRAME_LENGTH = 2_800_000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ detail: "A frame payload is required." }, { status: 400 });
  }
  const { frame, source, sessionId } = body as Record<string, unknown>;
  if (typeof frame !== "string" || !frame.startsWith("data:image/") || frame.length > MAX_FRAME_LENGTH) {
    return NextResponse.json({ detail: "Frame must be a valid, downscaled image data URL under 2 MB." }, { status: 422 });
  }
  if (source !== "Webcam" && source !== "Screen share") {
    return NextResponse.json({ detail: "Source must be Webcam or Screen share." }, { status: 422 });
  }
  if (typeof sessionId !== "string" || sessionId.length < 8 || sessionId.length > 100) {
    return NextResponse.json({ detail: "A valid monitoring sessionId is required." }, { status: 422 });
  }

  const modelUrl = (process.env.MODEL_SERVER_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  let modelResponse: Response;
  try {
    modelResponse = await fetch(`${modelUrl}/detect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ frame }),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Model service is unavailable", error);
    return NextResponse.json({ detail: "Model server is unavailable. Check that it is running at the configured URL." }, { status: 503 });
  }
  if (!modelResponse.ok) {
    const message = await modelResponse.text().catch(() => "");
    return NextResponse.json(
      { detail: `Model server returned ${modelResponse.status}.`, modelDetail: message.slice(0, 300) },
      { status: modelResponse.status === 400 || modelResponse.status === 422 ? 422 : 503 },
    );
  }

  let result: { detections?: DetectionInput[]; image?: { width: number; height: number }; timing_ms?: unknown };
  try {
    result = await modelResponse.json();
  } catch {
    return NextResponse.json({ detail: "Model server returned an invalid response." }, { status: 502 });
  }
  if (!Array.isArray(result.detections) || result.detections.some((detection) =>
    !detection || typeof detection.label !== "string" || !isModelClass(detection.label)
      || !Number.isFinite(detection.confidence) || !Array.isArray(detection.bbox) || detection.bbox.length !== 4
  )) {
    return NextResponse.json({ detail: "Model server returned malformed detections." }, { status: 502 });
  }

  try {
    const db = await getDb();
    const levels = await readThreatLevels(db, false);
    const presence = await recordFrameDetections({
      db,
      sessionId,
      source,
      detections: result.detections,
      levels,
    });
    const threatByClass = new Map(presence.active.map((item) => [item.className, item.threatLevel]));
    const detections = result.detections.map((detection) => ({
      ...detection,
      threatLevel: threatByClass.get(detection.label) ?? levels[detection.label],
    }));
    return NextResponse.json({
      detections,
      alarms: presence.alarms,
      newAppearances: presence.newAppearances,
      image: result.image ?? null,
      timing_ms: result.timing_ms ?? null,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Unable to save detection event", error);
    return NextResponse.json({ detail: "Database is unavailable; frame was not recorded." }, { status: 503 });
  }
}
