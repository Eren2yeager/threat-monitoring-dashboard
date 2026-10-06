import type { Db, Document, ObjectId } from "mongodb";
import type { ModelClass, ThreatLevel } from "./classes";

export type DetectionInput = {
  class_id: number;
  label: ModelClass;
  confidence: number;
  bbox: [number, number, number, number];
};

export type EpisodeDocument = {
  sessionId: string;
  source: "Webcam" | "Screen share";
  className: ModelClass;
  confidence: number;
  bbox: [number, number, number, number];
  threatLevel: ThreatLevel;
  appearedAt: Date;
  lastSeenAt: Date;
  endedAt?: Date;
};

type ActiveEpisode = { eventId: ObjectId; lastSeenAt: number; alarmed: boolean };
type EpisodeState = Map<string, ActiveEpisode>;

declare global {
  var wildlifeEpisodes: EpisodeState | undefined;
}

const activeEpisodes: EpisodeState = globalThis.wildlifeEpisodes ?? new Map();
if (process.env.NODE_ENV !== "production") globalThis.wildlifeEpisodes = activeEpisodes;

const keyFor = (sessionId: string, label: string) => `${sessionId}:${label}`;

export async function recordFrameDetections(args: {
  db: Db;
  sessionId: string;
  source: "Webcam" | "Screen share";
  detections: DetectionInput[];
  levels: Record<ModelClass, ThreatLevel>;
  now?: number;
}) {
  const now = args.now ?? Date.now();
  const nowDate = new Date(now);
  const collection = args.db.collection<EpisodeDocument & Document>("detectionEvents");
  const found = new Map<ModelClass, DetectionInput>();
  for (const detection of args.detections) {
    const previous = found.get(detection.label);
    if (!previous || detection.confidence > previous.confidence) found.set(detection.label, detection);
  }

  const alarms: Array<{ className: ModelClass; threatLevel: "High"; episodeId: string }> = [];
  const newAppearances: ModelClass[] = [];
  const active: Array<{ className: ModelClass; threatLevel: ThreatLevel; confidence: number; bbox: DetectionInput["bbox"] }> = [];

  for (const [label, detection] of found) {
    const key = keyFor(args.sessionId, label);
    let episode = activeEpisodes.get(key);
    if (episode && now - episode.lastSeenAt >= 2_000) {
      await collection.updateOne({ _id: episode.eventId }, { $set: { endedAt: new Date(episode.lastSeenAt) } });
      activeEpisodes.delete(key);
      episode = undefined;
    }

    const threatLevel = args.levels[label] ?? "Medium";
    if (!episode) {
      const result = await collection.insertOne({
        sessionId: args.sessionId,
        source: args.source,
        className: label,
        confidence: detection.confidence,
        bbox: detection.bbox,
        threatLevel,
        appearedAt: nowDate,
        lastSeenAt: nowDate,
      });
      episode = { eventId: result.insertedId, lastSeenAt: now, alarmed: false };
      activeEpisodes.set(key, episode);
      newAppearances.push(label);
    } else {
      await collection.updateOne({ _id: episode.eventId }, {
        $set: { lastSeenAt: nowDate, confidence: detection.confidence, bbox: detection.bbox, threatLevel },
      });
      episode.lastSeenAt = now;
    }

    if (threatLevel === "High" && !episode.alarmed) {
      episode.alarmed = true;
      alarms.push({ className: label, threatLevel: "High", episodeId: String(episode.eventId) });
    }
    active.push({ className: label, threatLevel, confidence: detection.confidence, bbox: detection.bbox });
  }

  for (const [key, episode] of activeEpisodes) {
    if (!key.startsWith(`${args.sessionId}:`) || found.has(key.slice(args.sessionId.length + 1) as ModelClass)) continue;
    if (now - episode.lastSeenAt >= 2_000) {
      await collection.updateOne({ _id: episode.eventId }, { $set: { endedAt: new Date(episode.lastSeenAt) } });
      activeEpisodes.delete(key);
    }
  }

  return { active, alarms, newAppearances };
}

export async function endSession(db: Db, sessionId?: string) {
  const collection = db.collection<EpisodeDocument & Document>("detectionEvents");
  const pending = [...activeEpisodes.entries()].filter(([key]) => !sessionId || key.startsWith(`${sessionId}:`));
  for (const [key, episode] of pending) {
    await collection.updateOne({ _id: episode.eventId }, { $set: { endedAt: new Date(episode.lastSeenAt) } });
    activeEpisodes.delete(key);
  }
  return pending.length;
}

export function resetEpisodesForTests() {
  activeEpisodes.clear();
}
