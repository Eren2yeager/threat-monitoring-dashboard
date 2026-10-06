import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetEpisodesForTests, recordFrameDetections, type EpisodeDocument } from "../src/lib/episodes";
import type { ModelClass, ThreatLevel } from "../src/lib/classes";

const levels = Object.fromEntries([
  "bear", "cat", "cattle", "crocodile", "deer", "dog", "elephant", "fox", "hyena", "jackal",
  "leopard", "lion", "monkey", "person", "rabbit", "snake", "tiger", "weasel", "wild_boar", "wolf",
].map((name) => [name, name === "tiger" ? "High" : "Medium"])) as Record<ModelClass, ThreatLevel>;

function makeDatabase() {
  const rows: Array<EpisodeDocument & { _id: { toString(): string } }> = [];
  let nextId = 0;
  const insertOne = vi.fn(async (value: EpisodeDocument) => {
    const _id = { toString: () => `episode-${++nextId}` };
    rows.push({ ...value, _id });
    return { insertedId: _id };
  });
  const updateOne = vi.fn(async (filter: { _id: unknown }, update: { $set: Partial<EpisodeDocument> }) => {
    const row = rows.find((item) => item._id === filter._id);
    if (row) Object.assign(row, update.$set);
    return { modifiedCount: row ? 1 : 0 };
  });
  const db = { collection: () => ({ insertOne, updateOne }) } as never;
  return { db, rows, insertOne, updateOne };
}

describe("presence episodes", () => {
  beforeEach(() => resetEpisodesForTests());

  it("groups repeated frames and alarms once until two seconds of absence", async () => {
    const { db, rows, insertOne } = makeDatabase();
    const detection = { class_id: 16, label: "tiger" as const, confidence: 0.91, bbox: [10, 20, 90, 120] as [number, number, number, number] };
    const first = await recordFrameDetections({ db, sessionId: "session-1234", source: "Webcam", detections: [detection, detection], levels, now: 1_000 });
    const second = await recordFrameDetections({ db, sessionId: "session-1234", source: "Webcam", detections: [detection], levels, now: 1_500 });
    expect(first.alarms).toHaveLength(1);
    expect(second.alarms).toHaveLength(0);
    expect(first.newAppearances).toEqual(["tiger"]);
    expect(second.newAppearances).toEqual([]);
    expect(insertOne).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);

    await recordFrameDetections({ db, sessionId: "session-1234", source: "Webcam", detections: [], levels, now: 3_500 });
    const rearmed = await recordFrameDetections({ db, sessionId: "session-1234", source: "Webcam", detections: [detection], levels, now: 3_600 });
    expect(rearmed.alarms).toHaveLength(1);
    expect(rearmed.newAppearances).toEqual(["tiger"]);
    expect(insertOne).toHaveBeenCalledTimes(2);
  });

  it("keeps separate class appearances in one source session", async () => {
    const { db, rows } = makeDatabase();
    const result = await recordFrameDetections({
      db,
      sessionId: "session-abcd",
      source: "Screen share",
      detections: [
        { class_id: 0, label: "bear", confidence: 0.8, bbox: [0, 0, 10, 10] },
        { class_id: 16, label: "tiger", confidence: 0.9, bbox: [5, 5, 15, 15] },
      ],
      levels,
      now: 50_000,
    });
    expect(rows).toHaveLength(2);
    expect(result.newAppearances.sort()).toEqual(["bear", "tiger"]);
    expect(result.alarms.map((alarm) => alarm.className)).toEqual(["tiger"]);
  });
});
