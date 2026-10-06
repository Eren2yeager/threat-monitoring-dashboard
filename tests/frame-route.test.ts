import { afterEach, describe, expect, it, vi } from "vitest";

const { getDbMock, readThreatLevelsMock, recordFrameMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  readThreatLevelsMock: vi.fn(),
  recordFrameMock: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({ getDb: getDbMock }));
vi.mock("@/lib/threats", () => ({ readThreatLevels: readThreatLevelsMock }));
vi.mock("@/lib/episodes", () => ({ recordFrameDetections: recordFrameMock }));

import { POST } from "../src/app/api/monitor/frame/route";

const validBody = { frame: "data:image/jpeg;base64,ZmFrZQ==", source: "Webcam", sessionId: "session-12345" };

describe("POST /api/monitor/frame", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects malformed frame input before calling the model", async () => {
    const response = await POST(new Request("http://localhost/api/monitor/frame", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...validBody, frame: "not-an-image" }),
    }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ detail: expect.stringContaining("Frame must") });
  });

  it("reports an unavailable model server as 503", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const response = await POST(new Request("http://localhost/api/monitor/frame", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validBody),
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ detail: expect.stringContaining("Model server is unavailable") });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("applies database threat settings to mocked model detections", async () => {
    getDbMock.mockResolvedValue({ collection: vi.fn() });
    readThreatLevelsMock.mockResolvedValue({ tiger: "High" });
    recordFrameMock.mockResolvedValue({
      active: [{ className: "tiger", threatLevel: "High" }],
      alarms: [{ className: "tiger", threatLevel: "High", episodeId: "episode-1" }],
      newAppearances: ["tiger"],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      image: { width: 640, height: 360 },
      detections: [{ class_id: 16, label: "tiger", confidence: 0.9, bbox: [10, 20, 80, 100] }],
      timing_ms: { inference: 25 },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const response = await POST(new Request("http://localhost/api/monitor/frame", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validBody),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      detections: [{ label: "tiger", threatLevel: "High" }],
      alarms: [{ className: "tiger", episodeId: "episode-1" }],
      newAppearances: ["tiger"],
    });
    expect(recordFrameMock).toHaveBeenCalledWith(expect.objectContaining({ sessionId: validBody.sessionId, source: "Webcam" }));
  });
});
