import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRole } from "@edward/auth";
import type { LlmChatMessage } from "../../../lib/llm/context.js";

const prepareUrlScrapeContextMock = vi.fn();

vi.mock("../../../services/websearch/urlScraper.service.js", () => ({
  prepareUrlScrapeContext: prepareUrlScrapeContextMock,
}));

vi.mock("../../../controllers/chat/sse.utils.js", () => ({
  sendSSEEvent: vi.fn(),
}));

describe("prepareBaseMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareUrlScrapeContextMock.mockResolvedValue({
      results: [],
      contextMessage: null,
    });
  });

  it("uses only user history messages for follow-up turns", async () => {
    const { prepareBaseMessages } = await import(
      "../../../controllers/chat/session/orchestrator/messagePreparation.js"
    );

    const result = await prepareBaseMessages({
      res: {} as never,
      userTextContent: "continue",
      userContent: "continue",
      isFollowUp: true,
      historyMessages: [
        { role: MessageRole.User, content: "first user" },
        { role: MessageRole.Assistant, content: "assistant response" },
        { role: MessageRole.User, content: "second user" },
      ],
      projectContext: "PROJECT CONTEXT",
    });

    expect(result.baseMessages).toHaveLength(3);
    expect(result.baseMessages[0]?.role).toBe(MessageRole.User);
    expect(typeof result.baseMessages[0]?.content).toBe("string");
    expect(String(result.baseMessages[0]?.content)).toContain(
      "FOLLOW-UP USER HISTORY (COMPACT):",
    );
    expect(String(result.baseMessages[0]?.content)).toContain("1. first user");
    expect(String(result.baseMessages[0]?.content)).toContain("2. second user");
    expect(String(result.baseMessages[0]?.content)).not.toContain(
      "assistant response",
    );
    expect(result.baseMessages[1]).toEqual({
      role: MessageRole.User,
      content: "PROJECT CONTEXT",
    });
    expect(result.baseMessages[2]).toEqual({
      role: MessageRole.User,
      content: "continue",
    });
  });

  it("limits follow-up user history to the most recent six messages", async () => {
    const { prepareBaseMessages } = await import(
      "../../../controllers/chat/session/orchestrator/messagePreparation.js"
    );

    const historyMessages: LlmChatMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: MessageRole.User,
      content: `user-${index + 1}`,
    }));
    historyMessages.splice(3, 0, {
      role: MessageRole.Assistant,
      content: "assistant-noise",
    });

    const result = await prepareBaseMessages({
      res: {} as never,
      userTextContent: "latest",
      userContent: "latest",
      isFollowUp: true,
      historyMessages,
      projectContext: "",
    });

    expect(result.baseMessages).toHaveLength(2);
    const compactHistory = String(result.baseMessages[0]?.content);
    expect(compactHistory).toContain("1. user-3");
    expect(compactHistory).toContain("2. user-4");
    expect(compactHistory).toContain("3. user-5");
    expect(compactHistory).toContain("4. user-6");
    expect(compactHistory).toContain("5. user-7");
    expect(compactHistory).toContain("6. user-8");
    expect(compactHistory).not.toContain("assistant-noise");
    expect(result.baseMessages.at(-1)).toEqual({
      role: MessageRole.User,
      content: "latest",
    });
  });

  it("converts multimodal history into compact text-only context", async () => {
    const { prepareBaseMessages } = await import(
      "../../../controllers/chat/session/orchestrator/messagePreparation.js"
    );

    const result = await prepareBaseMessages({
      res: {} as never,
      userTextContent: "continue",
      userContent: "continue",
      isFollowUp: true,
      historyMessages: [
        {
          role: MessageRole.User,
          content: [
            { type: "text", text: "use this attached screenshot" },
            { type: "image", base64: "ZmFrZQ==", mimeType: "image/png" },
          ],
        },
      ],
      projectContext: "",
    });

    expect(result.baseMessages).toHaveLength(2);
    expect(typeof result.baseMessages[0]?.content).toBe("string");
    expect(String(result.baseMessages[0]?.content)).toContain(
      "use this attached screenshot",
    );
    expect(String(result.baseMessages[0]?.content)).not.toContain("ZmFrZQ==");
  });
});
