import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { BuildRecordStatus } from "@edward/shared/api/contracts";

const createBuildMock = vi.fn();
const updateBuildMock = vi.fn();
const enqueueBuildJobMock = vi.fn();
const flushSandboxMock = vi.fn();
const validateGeneratedOutputMock = vi.fn();
const applyDeterministicPostgenAutofixesMock = vi.fn();
const redisPublishMock = vi.fn();
const sendSSEEventMock = vi.fn();
const sendSSERecoverableErrorMock = vi.fn();

vi.mock("@edward/auth", () => ({
  createBuild: createBuildMock,
  updateBuild: updateBuildMock,
}));

vi.mock("../../../services/queue/enqueue.js", () => ({
  enqueueBuildJob: enqueueBuildJobMock,
}));

vi.mock("../../../services/sandbox/write/flush.js", () => ({
  flushSandbox: flushSandboxMock,
}));

vi.mock("../../../services/planning/validators/postgenValidator.js", () => ({
  validateGeneratedOutput: validateGeneratedOutputMock,
}));

vi.mock("../../../services/chat/session/orchestrator/postgenAutofix.js", () => ({
  applyDeterministicPostgenAutofixes: applyDeterministicPostgenAutofixesMock,
}));

vi.mock("../../../lib/redis.js", () => ({
  redis: {
    publish: redisPublishMock,
  },
}));

vi.mock("../../../services/sse-utils/service.js", () => ({
  sendSSEEvent: sendSSEEventMock,
  sendSSERecoverableError: sendSSERecoverableErrorMock,
}));

function createResponseMock() {
  const res = {
    headersSent: false,
    writable: true,
    writableEnded: false,
    setHeader: vi.fn(),
    write: vi.fn(() => true),
    end: vi.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
      return this;
    }),
    status: vi.fn(function (this: object) {
      return this;
    }),
    send: vi.fn(function (this: object) {
      return this;
    }),
  };

  return res;
}

function asResponse(res: ReturnType<typeof createResponseMock>): Response {
  if (
    typeof res !== "object" ||
    res === null ||
    typeof res.headersSent !== "boolean" ||
    typeof res.writable !== "boolean" ||
    typeof res.writableEnded !== "boolean" ||
    typeof res.setHeader !== "function" ||
    typeof res.write !== "function" ||
    typeof res.end !== "function" ||
    typeof res.status !== "function" ||
    typeof res.send !== "function"
  ) {
    throw new Error("Response mock is missing required shape for processBuildPipeline");
  }

  return res as Response;
}

describe("processBuildPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateGeneratedOutputMock.mockReturnValue({ valid: true, violations: [] });
    applyDeterministicPostgenAutofixesMock.mockResolvedValue([]);
    createBuildMock.mockResolvedValue({ id: "build-1" });
    updateBuildMock.mockResolvedValue(undefined);
    enqueueBuildJobMock.mockResolvedValue("job-1");
    flushSandboxMock.mockResolvedValue(undefined);
    redisPublishMock.mockResolvedValue(1);
  });

  it("skips build queueing when no files or dependency changes were produced", async () => {
    const { processBuildPipeline } = await import(
      "../../../services/chat/session/orchestrator/buildPipeline.js"
    );

    await processBuildPipeline({
      sandboxId: "sandbox-1",
      chatId: "chat-1",
      userId: "user-1",
      assistantMessageId: "assistant-1",
      runId: "run-1",
      res: asResponse(createResponseMock()),
      framework: "vite-react",
      mode: "generate",
      generatedFiles: new Map(),
      declaredPackages: [],
    });

    expect(applyDeterministicPostgenAutofixesMock).not.toHaveBeenCalled();
    expect(validateGeneratedOutputMock).not.toHaveBeenCalled();
    expect(flushSandboxMock).not.toHaveBeenCalled();
    expect(createBuildMock).not.toHaveBeenCalled();
    expect(enqueueBuildJobMock).not.toHaveBeenCalled();
    expect(redisPublishMock).not.toHaveBeenCalled();
    expect(sendSSEEventMock).not.toHaveBeenCalled();
    expect(sendSSERecoverableErrorMock).not.toHaveBeenCalled();
  });

  it("queues a build when files were generated", async () => {
    const { processBuildPipeline } = await import(
      "../../../services/chat/session/orchestrator/buildPipeline.js"
    );

    const generatedFiles = new Map<string, string>([
      ["src/App.tsx", "export default function App(){return null;}"],
    ]);

    await processBuildPipeline({
      sandboxId: "sandbox-1",
      chatId: "chat-1",
      userId: "user-1",
      assistantMessageId: "assistant-1",
      runId: "run-1",
      res: asResponse(createResponseMock()),
      framework: "vite-react",
      mode: "generate",
      generatedFiles,
      declaredPackages: [],
    });

    expect(applyDeterministicPostgenAutofixesMock).toHaveBeenCalledOnce();
    expect(validateGeneratedOutputMock).toHaveBeenCalledOnce();
    expect(flushSandboxMock).toHaveBeenCalledWith("sandbox-1", true);
    expect(createBuildMock).toHaveBeenCalledWith({
      chatId: "chat-1",
      messageId: "assistant-1",
      status: BuildRecordStatus.QUEUED,
    });
    expect(enqueueBuildJobMock).toHaveBeenCalledWith({
      sandboxId: "sandbox-1",
      userId: "user-1",
      chatId: "chat-1",
      messageId: "assistant-1",
      buildId: "build-1",
      runId: "run-1",
    });

    if (redisPublishMock.mock.calls.length === 0) {
      throw new Error("Expected redis.publish to be called at least once");
    }

    const firstPublishCall = redisPublishMock.mock.calls[0];
    if (!Array.isArray(firstPublishCall)) {
      throw new Error("Expected redis.publish first call to be an argument tuple");
    }

    const [channel, payload] = firstPublishCall;
    if (typeof channel !== "string" || typeof payload !== "string") {
      throw new Error("Expected redis.publish first two arguments to be strings");
    }

    expect(channel).toBe("edward:build-status:chat-1");
    expect(JSON.parse(payload)).toMatchObject({
      buildId: "build-1",
      runId: "run-1",
      status: BuildRecordStatus.QUEUED,
    });
  });

  it("queues a build when dependencies were declared even without file writes", async () => {
    const { processBuildPipeline } = await import(
      "../../../services/chat/session/orchestrator/buildPipeline.js"
    );

    await processBuildPipeline({
      sandboxId: "sandbox-1",
      chatId: "chat-1",
      userId: "user-1",
      assistantMessageId: "assistant-1",
      runId: "run-1",
      res: asResponse(createResponseMock()),
      framework: "vite-react",
      mode: "generate",
      generatedFiles: new Map(),
      declaredPackages: ["zod"],
    });

    expect(applyDeterministicPostgenAutofixesMock).toHaveBeenCalledOnce();
    expect(validateGeneratedOutputMock).not.toHaveBeenCalled();
    expect(flushSandboxMock).toHaveBeenCalledWith("sandbox-1", true);
    expect(createBuildMock).toHaveBeenCalledWith({
      chatId: "chat-1",
      messageId: "assistant-1",
      status: BuildRecordStatus.QUEUED,
    });
    expect(enqueueBuildJobMock).toHaveBeenCalledOnce();
  });

  it("creates a failed build and avoids queueing when validation has blocking errors", async () => {
    const { processBuildPipeline } = await import(
      "../../../services/chat/session/orchestrator/buildPipeline.js"
    );

    validateGeneratedOutputMock.mockReturnValueOnce({
      valid: false,
      violations: [
        {
          type: "logic-quality",
          severity: "error",
          message: "Component contains placeholder TODO logic",
          file: "src/App.tsx",
        },
      ],
    });

    await processBuildPipeline({
      sandboxId: "sandbox-1",
      chatId: "chat-1",
      userId: "user-1",
      assistantMessageId: "assistant-1",
      runId: "run-1",
      res: asResponse(createResponseMock()),
      framework: "vite-react",
      mode: "generate",
      generatedFiles: new Map([
        ["src/App.tsx", "export default function App(){ return <div>TODO</div>; }"],
      ]),
      declaredPackages: [],
    });

    expect(createBuildMock).toHaveBeenCalledWith({
      chatId: "chat-1",
      messageId: "assistant-1",
      status: BuildRecordStatus.FAILED,
    });
    expect(updateBuildMock).toHaveBeenCalledWith(
      "build-1",
      expect.objectContaining({ status: BuildRecordStatus.FAILED }),
    );
    expect(enqueueBuildJobMock).not.toHaveBeenCalled();
    expect(sendSSERecoverableErrorMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining("[Validation]"),
      expect.objectContaining({ code: "postgen_validation" }),
    );
    expect(sendSSEEventMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ status: BuildRecordStatus.FAILED }),
    );
  });

  it("marks the build as failed and emits SSE build failure when enqueue fails", async () => {
    const { processBuildPipeline } = await import(
      "../../../services/chat/session/orchestrator/buildPipeline.js"
    );

    enqueueBuildJobMock.mockRejectedValueOnce(new Error("Queue unavailable"));

    await processBuildPipeline({
      sandboxId: "sandbox-1",
      chatId: "chat-1",
      userId: "user-1",
      assistantMessageId: "assistant-1",
      runId: "run-1",
      res: asResponse(createResponseMock()),
      framework: "vite-react",
      mode: "generate",
      generatedFiles: new Map([
        ["src/App.tsx", "export default function App(){ return null; }"],
      ]),
      declaredPackages: [],
    });

    expect(createBuildMock).toHaveBeenCalledWith({
      chatId: "chat-1",
      messageId: "assistant-1",
      status: BuildRecordStatus.QUEUED,
    });
    expect(updateBuildMock).toHaveBeenCalledWith(
      "build-1",
      expect.objectContaining({ status: BuildRecordStatus.FAILED }),
    );
    expect(sendSSEEventMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ status: BuildRecordStatus.FAILED }),
    );
  });
});
