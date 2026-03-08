import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunMetadata } from "../../../services/runs/runMetadata.js";

const mocks = vi.hoisted(() => ({
  updateRun: vi.fn(),
}));

vi.mock("@edward/auth", () => ({
  updateRun: mocks.updateRun,
}));

describe("agent run processor session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateRun.mockResolvedValue(undefined);
  });

  it("creates worker request with EventEmitter semantics", async () => {
    const { createWorkerRequest } = await import(
      "../../../services/runs/agent-run-worker/processor.session.js"
    );

    const req = createWorkerRequest("user-1");

    expect(req.userId).toBe("user-1");
    expect(typeof (req as unknown as { on: unknown }).on).toBe("function");
    expect(req.sessionId).toBeUndefined();
  });

  it("builds run session input and persists checkpoint updates", async () => {
    const { buildWorkerRunSessionInput } = await import(
      "../../../services/runs/agent-run-worker/processor.session.js"
    );

    let metadata = {
      workflow: { id: "wf" },
      userContent: [{ type: "text", text: "hello" }],
      userTextContent: "hello",
      preVerifiedDeps: ["zod"],
      isFollowUp: true,
      intent: "generate",
      model: "gpt-5",
      resumeCheckpoint: undefined,
      traceId: "trace-1",
      historyMessages: [],
      projectContext: "",
    } as unknown as AgentRunMetadata;

    const onMetadataUpdated = vi.fn((next) => {
      metadata = next;
    });
    const onTurnUpdated = vi.fn();

    const input = buildWorkerRunSessionInput({
      req: { userId: "user-1" } as never,
      res: {} as never,
      externalSignal: new AbortController().signal,
      workflow: metadata.workflow,
      run: {
        userId: "user-1",
        chatId: "chat-1",
        userMessageId: "msg-user",
        assistantMessageId: "msg-assistant",
      },
      decryptedApiKey: "sk-key",
      getMetadata: () => metadata,
      historyMessages: [{ role: "user", content: "hello" }] as never,
      projectContext: "ctx",
      runId: "run-1",
      onMetadataUpdated,
      onTurnUpdated,
    });

    expect(input.chatId).toBe("chat-1");
    expect(input.userId).toBe("user-1");
    expect(input.runId).toBe("run-1");
    expect(input.resumeCheckpoint).toBeUndefined();

    await input.onCheckpoint({
      turn: 3,
      fullRawResponse: "raw",
      agentMessages: [{ role: "assistant", content: "ok" }] as never,
      sandboxTagDetected: true,
      totalToolCallsInRun: 2,
      outputTokens: 42,
      updatedAt: 123,
    });

    expect(onMetadataUpdated).toHaveBeenCalledTimes(1);
    expect(onTurnUpdated).toHaveBeenCalledWith(3);
    expect(mocks.updateRun).toHaveBeenCalledWith("run-1", {
      currentTurn: 3,
      metadata: expect.objectContaining({
        resumeCheckpoint: expect.objectContaining({
          turn: 3,
          sandboxTagDetected: true,
          outputTokens: 42,
        }),
      }),
    });
  });

  it("reuses existing resume checkpoint metadata when present", async () => {
    const { buildWorkerRunSessionInput } = await import(
      "../../../services/runs/agent-run-worker/processor.session.js"
    );

    const metadata = {
      workflow: { id: "wf" },
      userContent: [{ type: "text", text: "hello" }],
      userTextContent: "hello",
      preVerifiedDeps: [],
      isFollowUp: false,
      intent: "generate",
      model: "gpt-5",
      resumeCheckpoint: {
        turn: 4,
        fullRawResponse: "raw-4",
        agentMessages: [{ role: "assistant", content: "done" }],
        sandboxTagDetected: false,
        totalToolCallsInRun: 1,
        outputTokens: 99,
        updatedAt: 100,
      },
      traceId: "trace-2",
      historyMessages: [],
      projectContext: "",
    } as unknown as AgentRunMetadata;

    const input = buildWorkerRunSessionInput({
      req: { userId: "user-2" } as never,
      res: {} as never,
      externalSignal: new AbortController().signal,
      workflow: metadata.workflow,
      run: {
        userId: "user-2",
        chatId: "chat-2",
        userMessageId: "msg-u2",
        assistantMessageId: "msg-a2",
      },
      decryptedApiKey: "sk-key",
      getMetadata: () => metadata,
      historyMessages: [] as never,
      projectContext: "ctx-2",
      runId: "run-2",
      onMetadataUpdated: vi.fn(),
      onTurnUpdated: vi.fn(),
    });

    expect(input.resumeCheckpoint).toMatchObject({
      turn: 4,
      fullRawResponse: "raw-4",
      sandboxTagDetected: false,
      totalToolCallsInRun: 1,
      outputTokens: 99,
    });
  });
});
