import { describe, expect, it, vi } from "vitest";
import { MODEL_CLASSES } from "../src/lib/classes";
import { defaultThreats, setThreatLevel } from "../src/lib/threats";

describe("class threat settings", () => {
  it("seeds all 20 model classes to Medium", () => {
    const threats = defaultThreats(new Date("2026-01-01T00:00:00Z"));
    expect(threats.map(({ name }) => name)).toEqual([...MODEL_CLASSES]);
    expect(threats.every(({ level }) => level === "Medium")).toBe(true);
  });

  it("persists an edited class level", async () => {
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const bulkWrite = vi.fn().mockResolvedValue({ acknowledged: true });
    const db = { collection: () => ({ bulkWrite, updateOne }) } as never;
    await setThreatLevel(db, "tiger", "High");
    expect(updateOne).toHaveBeenCalledWith(
      { name: "tiger" },
      expect.objectContaining({ $set: expect.objectContaining({ level: "High" }) }),
      { upsert: true },
    );
  });
});
