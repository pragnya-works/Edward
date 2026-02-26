import { beforeEach, describe, expect, it, vi } from "vitest";

const generateResponseMock = vi.fn();
const updateChatMetaMock = vi.fn();

vi.mock("../../../lib/llm/provider.client.js", () => ({
  generateResponse: generateResponseMock,
}));

vi.mock("../../../services/chat.service.js", () => ({
  updateChatMeta: updateChatMetaMock,
}));

describe("scheduleChatMetaGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists generated metadata and mirrored seo fields", async () => {
    generateResponseMock.mockResolvedValue(
      '{"title":"Marketing Site","description":"Landing page with product highlights"}',
    );

    const { scheduleChatMetaGeneration } = await import(
      "../../../controllers/chat/session/orchestrator/chatMetaGeneration.js"
    );

    scheduleChatMetaGeneration({
      isFollowUp: false,
      decryptedApiKey: "test-key",
      userContent: "Build a marketing site",
      chatId: "chat-1",
    });

    await vi.waitFor(() => {
      expect(updateChatMetaMock).toHaveBeenCalledWith("chat-1", {
        title: "Marketing Site",
        description: "Landing page with product highlights",
        seoTitle: "Marketing Site",
        seoDescription: "Landing page with product highlights",
      });
    });
  });

  it("skips metadata generation for follow-up turns", async () => {
    const { scheduleChatMetaGeneration } = await import(
      "../../../controllers/chat/session/orchestrator/chatMetaGeneration.js"
    );

    scheduleChatMetaGeneration({
      isFollowUp: true,
      decryptedApiKey: "test-key",
      userContent: "Refine button styles",
      chatId: "chat-2",
    });

    expect(generateResponseMock).not.toHaveBeenCalled();
    expect(updateChatMetaMock).not.toHaveBeenCalled();
  });
});
