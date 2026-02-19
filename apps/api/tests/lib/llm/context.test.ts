import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();
const getLatestBuildByChatIdMock = vi.fn();
const getActiveSandboxMock = vi.fn();

vi.mock("@edward/auth", () => ({
  db: {
    query: {
      message: {
        findMany: findManyMock,
      },
    },
  },
  MessageRole: {
    System: "system",
    User: "user",
    Assistant: "assistant",
  },
  message: { chatId: "chat_id" },
  attachment: { messageId: "message_id" },
  eq: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  getLatestBuildByChatId: getLatestBuildByChatIdMock,
}));

vi.mock("../../../services/diagnostics/analyzer.js", () => ({
  formatErrorForLLM: vi.fn(() => ""),
}));

vi.mock("../../../services/sandbox/lifecycle/provisioning.js", () => ({
  getActiveSandbox: getActiveSandboxMock,
}));

vi.mock("../../../services/sandbox/read.sandbox.js", () => ({
  readAllProjectFiles: vi.fn(),
  readSpecificFiles: vi.fn(),
  formatProjectSnapshot: vi.fn(() => ""),
}));

vi.mock("../../../utils/imageValidation.js", () => ({
  validateBase64Image: vi.fn(),
  validateImageUrl: vi.fn(),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("buildConversationMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLatestBuildByChatIdMock.mockResolvedValue(null);
    getActiveSandboxMock.mockResolvedValue(null);
  });

  it("excludes the just-persisted user message from follow-up history", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "msg-current",
        role: "user",
        content: "please fix the build",
        createdAt: new Date(),
      },
      {
        id: "msg-older-assistant",
        role: "assistant",
        content: "Existing assistant context",
        createdAt: new Date(),
      },
    ]);

    const { buildConversationMessages } = await import(
      "../../../lib/llm/context.js"
    );

    const result = await buildConversationMessages("chat-1", {
      excludeMessageIds: ["msg-current"],
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 9,
      }),
    );
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toEqual({
      role: "assistant",
      content: "Existing assistant context",
    });
  });
});
