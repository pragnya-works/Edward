import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("processBuildPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateGeneratedOutputMock.mockReturnValue({ valid: true, violations: [] });
    applyDeterministicPostgenAutofixesMock.mockResolvedValue([]);
    createBuildMock.mockResolvedValue({ id: "build-1" });
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
      res: {} as never,
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
      res: {} as never,
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

    const [channel, payload] = redisPublishMock.mock.calls[0] as [string, string];
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
      res: {} as never,
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
});
