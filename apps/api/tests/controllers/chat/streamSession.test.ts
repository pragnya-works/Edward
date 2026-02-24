import { beforeEach, describe, expect, it, vi } from "vitest";
import { runStreamSession } from "../../../controllers/chat/session/session.controller.js";

const mockRefs = vi.hoisted(() => ({
  runStreamSessionOrchestrator: vi.fn(),
}));

vi.mock("../../../controllers/chat/session/orchestrator/runStreamSession.orchestrator.js", () => ({
  runStreamSession: mockRefs.runStreamSessionOrchestrator,
}));

describe("session controller delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefs.runStreamSessionOrchestrator.mockResolvedValue(undefined);
  });

  it("delegates runStreamSession to orchestrator module", async () => {
    const params = {
      req: { on: vi.fn() } as never,
      res: { write: vi.fn(), end: vi.fn() } as never,
      workflow: {
        id: "wf-1",
        userId: "user-1",
        chatId: "chat-1",
        status: "pending",
        currentStep: "ANALYZE",
        history: [],
        context: { errors: [] },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never,
      userId: "user-1",
      chatId: "chat-1",
      decryptedApiKey: "key",
      userContent: "hello" as never,
      userTextContent: "hello",
      userMessageId: "msg-user-1",
      assistantMessageId: "msg-assistant-1",
      preVerifiedDeps: [],
    };

    await runStreamSession(params);

    expect(mockRefs.runStreamSessionOrchestrator).toHaveBeenCalledWith(params);
  });
});
