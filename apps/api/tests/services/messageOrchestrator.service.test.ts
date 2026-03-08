import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refs = vi.hoisted(() => ({
  getUserWithApiKey: vi.fn(),
  decrypt: vi.fn(),
  getRunAdmissionWindow: vi.fn(),
  sendStreamError: vi.fn(),
  createAdmittedRun: vi.fn(),
  enqueueAdmittedRun: vi.fn(),
  getOrCreateChat: vi.fn(),
  saveAttachments: vi.fn(),
  saveMessage: vi.fn(),
  createWorkflow: vi.fn(),
  advanceWorkflow: vi.fn(),
  buildMultimodalContentForLLM: vi.fn(),
  parseMultimodalContent: vi.fn(),
  toImageAttachments: vi.fn(),
  createAgentRunMetadata: vi.fn(),
  streamRunEventsFromPersistence: vi.fn(),
  resolveRetryTargets: vi.fn(),
}));

vi.mock("../../middleware/auth.js", () => ({
  getAuthenticatedUserId: vi.fn(() => "user-1"),
}));

vi.mock("../../middleware/securityTelemetry.js", () => ({
  getRequestId: vi.fn(() => "trace-1"),
}));

vi.mock("../../services/apiKey.service.js", () => ({
  getUserWithApiKey: refs.getUserWithApiKey,
}));

vi.mock("../../utils/encryption.js", () => ({
  decrypt: refs.decrypt,
}));

vi.mock("../../utils/streamError.js", () => ({
  sendStreamError: refs.sendStreamError,
}));

vi.mock("../../services/runs/runAdmission.service.js", () => ({
  getRunAdmissionWindow: refs.getRunAdmissionWindow,
  createAdmittedRun: refs.createAdmittedRun,
  enqueueAdmittedRun: refs.enqueueAdmittedRun,
}));

vi.mock("../../services/chat.service.js", () => ({
  getOrCreateChat: refs.getOrCreateChat,
  saveAttachments: refs.saveAttachments,
  saveMessage: refs.saveMessage,
}));

vi.mock("../../services/chatMeta.service.js", () => ({
  deriveInitialChatMetadata: vi.fn(() => ({
    title: "Title",
    description: "Description",
  })),
}));

vi.mock("../../services/planning/workflow/engine.js", () => ({
  createWorkflow: refs.createWorkflow,
  advanceWorkflow: refs.advanceWorkflow,
}));

vi.mock("../../services/multimodal-utils/service.js", () => ({
  buildMultimodalContentForLLM: refs.buildMultimodalContentForLLM,
  parseMultimodalContent: refs.parseMultimodalContent,
  toImageAttachments: refs.toImageAttachments,
}));

vi.mock("../../services/runs/runMetadata.js", () => ({
  createAgentRunMetadata: refs.createAgentRunMetadata,
}));

vi.mock("../../services/run-event-stream-utils/service.js", () => ({
  streamRunEventsFromPersistence: refs.streamRunEventsFromPersistence,
}));

vi.mock("../../services/runs/messageOrchestrator.helpers.js", () => ({
  cleanupUnqueuedUserMessage: vi.fn(),
  resolveRetryTargets: refs.resolveRetryTargets,
}));

describe("unifiedSendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refs.getRunAdmissionWindow.mockResolvedValue({
      activeRunDepth: 0,
      overloaded: false,
      userRunLimit: 1,
    });
    refs.getUserWithApiKey.mockResolvedValue({
      id: "user-1",
      apiKey: "encrypted-key",
      preferredModel: "claude-sonnet-4-5",
    });
    refs.decrypt.mockReturnValue(
      "sk-proj-test-key-123456789012345678901234567890123456789012345678",
    );
    refs.parseMultimodalContent.mockResolvedValue({
      textContent: "Build me a feature",
      hasImages: false,
      images: [],
    });
    refs.getOrCreateChat.mockResolvedValue({
      chatId: "chat-1",
      isNewChat: true,
    });
    refs.resolveRetryTargets.mockResolvedValue({});
    refs.saveMessage.mockResolvedValue("msg-user-1");
    refs.createWorkflow.mockResolvedValue({
      context: { intent: { action: "generate" } },
    });
    refs.advanceWorkflow.mockResolvedValue(undefined);
    refs.buildMultimodalContentForLLM.mockReturnValue("Build me a feature");
    refs.createAgentRunMetadata.mockReturnValue({ meta: true });
    refs.createAdmittedRun.mockResolvedValue({
      run: { id: "run-1" },
    });
    refs.enqueueAdmittedRun.mockResolvedValue({ queued: true });
    refs.streamRunEventsFromPersistence.mockResolvedValue(undefined);
  });

  it("rejects a request model that does not match the saved API-key provider", async () => {
    const { unifiedSendMessage } =
      await import("../../services/runs/messageOrchestrator.service.js");

    const req = {
      body: {
        content: "Build me a feature",
        model: "claude-sonnet-4-5",
      },
    } as never;
    const res = {} as Response;

    await unifiedSendMessage(req, res);

    expect(refs.sendStreamError).toHaveBeenCalledWith(
      res,
      400,
      "Selected model is incompatible with the configured provider.",
    );
  });

  it("continues when the saved API-key provider matches the requested model", async () => {
    const { unifiedSendMessage } =
      await import("../../services/runs/messageOrchestrator.service.js");

    const req = {
      body: {
        content: "Build me a feature",
        model: "gpt-5.3-codex",
      },
    } as never;
    const res = {
      setHeader: vi.fn(),
      write: vi.fn(),
      writable: true,
      writableEnded: false,
    } as unknown as Response;

    await unifiedSendMessage(req, res);

    expect(refs.sendStreamError).not.toHaveBeenCalled();
    expect(refs.createAdmittedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        userId: "user-1",
      }),
    );
    expect(refs.streamRunEventsFromPersistence).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1" }),
    );
  });

  it("returns an error when no saved API key exists", async () => {
    const { unifiedSendMessage } =
      await import("../../services/runs/messageOrchestrator.service.js");

    refs.getUserWithApiKey.mockResolvedValueOnce({
      id: "user-1",
      apiKey: null,
      preferredModel: null,
    });

    const req = {
      body: {
        content: "Build me a feature",
      },
    } as never;
    const res = {} as Response;

    await unifiedSendMessage(req, res);

    expect(refs.sendStreamError).toHaveBeenCalledWith(
      res,
      400,
      "No API key found. Please configure your settings.",
    );
  });
});
