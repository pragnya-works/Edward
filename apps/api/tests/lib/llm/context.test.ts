import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const whereMock = vi.fn();
const getLatestBuildByChatIdMock = vi.fn();
const getActiveSandboxMock = vi.fn();
const formatErrorForLLMMock = vi.fn(() => "");

vi.mock("@edward/auth", () => ({
  db: {
    query: {
      message: {
        findMany: findManyMock,
      },
    },
    select: selectMock,
  },
  MessageRole: {
    System: "system",
    User: "user",
    Assistant: "assistant",
  },
  message: { chatId: "chat_id" },
  attachment: { messageId: "message_id" },
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  getLatestBuildByChatId: getLatestBuildByChatIdMock,
}));

vi.mock("../../../services/diagnostics/analyzer.js", () => ({
  formatErrorForLLM: formatErrorForLLMMock,
}));

vi.mock("../../../services/sandbox/lifecycle/provisioning.js", () => ({
  getActiveSandbox: getActiveSandboxMock,
}));

vi.mock("../../../services/sandbox/read.service.js", () => ({
  readAllProjectFiles: vi.fn(),
  readSpecificFiles: vi.fn(),
  formatProjectSnapshot: vi.fn(() => ""),
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
    selectMock.mockReturnValue({ from: fromMock });
    fromMock.mockReturnValue({ where: whereMock });
    whereMock.mockResolvedValue([]);
    getLatestBuildByChatIdMock.mockResolvedValue(null);
    getActiveSandboxMock.mockResolvedValue(null);
    formatErrorForLLMMock.mockReturnValue("");
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

  it("uses normalized error formatting for failed builds even when parsed errors are empty", async () => {
    findManyMock.mockResolvedValue([]);
    formatErrorForLLMMock.mockReturnValue("FORMATTED BUILD ERROR");
    getLatestBuildByChatIdMock.mockResolvedValue({
      status: "failed",
      errorReport: {
        failed: true,
        headline: "Build failed",
        errors: [],
        rawOutput: "raw logs",
      },
    });

    const { buildConversationMessages } = await import(
      "../../../lib/llm/context.js"
    );

    const result = await buildConversationMessages("chat-1");

    expect(formatErrorForLLMMock).toHaveBeenCalledTimes(1);
    expect(result.projectContext).toContain("FORMATTED BUILD ERROR");
    expect(result.projectContext).toContain("PROJECT CONTEXT:");
  });

  it("adds image URL context for historical user messages with image attachments", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "msg-1",
        role: "user",
        content: "Use this image as hero background",
        createdAt: new Date(),
      },
    ]);
    whereMock.mockResolvedValue([
      {
        messageId: "msg-1",
        type: "image",
        url: "https://cdn.example.com/background.png",
      },
    ]);

    const { buildConversationMessages } = await import(
      "../../../lib/llm/context.js"
    );

    const result = await buildConversationMessages("chat-1");
    const first = result.history[0];

    expect(first).toBeDefined();
    expect(first?.role).toBe("user");
    expect(first?.content).toEqual([
      { type: "text", text: "Use this image as hero background" },
      {
        type: "text",
        text: "Attached image URLs:\n1. https://cdn.example.com/background.png",
      },
    ]);
  });

  it("prioritizes the latest messages when history budget is constrained", async () => {
    const longContent = "x".repeat(40 * 1024);
    findManyMock.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        id: `msg-${index + 1}`,
        role: "assistant",
        content: `assistant-${index + 1} ${longContent}`,
        createdAt: new Date(Date.now() - index * 60_000),
      })),
    );

    const { buildConversationMessages } = await import(
      "../../../lib/llm/context.js"
    );

    const result = await buildConversationMessages("chat-1");

    const historyText = result.history
      .map((entry) => String(entry.content))
      .join("\n");

    expect(historyText).toContain("assistant-1");
    expect(historyText).not.toContain("assistant-6");
  });

  it("skips messages newer than maxCreatedAt when reconstructing history", async () => {
    const now = Date.now();
    findManyMock.mockResolvedValue([
      {
        id: "msg-newer",
        role: "assistant",
        content: "newer message",
        createdAt: new Date(now),
      },
      {
        id: "msg-older",
        role: "assistant",
        content: "older message",
        createdAt: new Date(now - 60_000),
      },
    ]);

    const { buildConversationMessages } = await import(
      "../../../lib/llm/context.js"
    );

    const result = await buildConversationMessages("chat-1", {
      maxCreatedAt: new Date(now - 30_000),
    });

    expect(result.history).toEqual([
      {
        role: "assistant",
        content: "older message",
      },
    ]);
  });
});
