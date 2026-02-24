import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamRunEventsFromPersistence } from "../../../controllers/chat/runEventStream.utils.js";

const mockRefs = vi.hoisted(() => ({
  streamRunEventsFromPersistenceInternal: vi.fn(),
}));

vi.mock("../../../services/runEventStream.utils/service.js", () => ({
  streamRunEventsFromPersistence: mockRefs.streamRunEventsFromPersistenceInternal,
}));

describe("runEventStream controller delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates streamRunEventsFromPersistence to service module", async () => {
    const options = {
      req: { query: {}, headers: {}, on: vi.fn() } as never,
      res: { setHeader: vi.fn(), write: vi.fn(), end: vi.fn() } as never,
      runId: "run-123",
      explicitLastEventId: "run-123:5",
    };

    await streamRunEventsFromPersistence(options);

    expect(mockRefs.streamRunEventsFromPersistenceInternal).toHaveBeenCalledWith(options);
  });
});
