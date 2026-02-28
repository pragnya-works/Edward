import { describe, expect, it } from "vitest";
import { deriveInitialChatMetadata } from "../../services/chatMeta.service.js";

describe("deriveInitialChatMetadata", () => {
  it("derives concise title and description from user text", () => {
    const result = deriveInitialChatMetadata({
      userTextContent:
        "Build a SaaS dashboard for tracking subscriptions and invoices with charts.",
      hasImages: false,
    });

    expect(result.title).toBe("Build A SaaS Dashboard For Tracking");
    expect(result.description).toBe(
      "Build a SaaS dashboard for tracking subscriptions and invoices with charts",
    );
  });

  it("removes markdown/link noise from metadata seed", () => {
    const result = deriveInitialChatMetadata({
      userTextContent:
        "## Create [landing page](https://example.com) for AI startup\n- include pricing cards",
      hasImages: false,
    });

    expect(result.title).toBe("Create Landing Page For AI Startup");
    expect(result.description).toBe(
      "Create landing page for AI startup include pricing cards",
    );
  });

  it("uses image-specific fallback when prompt has no text", () => {
    const result = deriveInitialChatMetadata({
      userTextContent: "   ",
      hasImages: true,
    });

    expect(result.title).toBe("Image-based App Request");
    expect(result.description).toBe(
      "Build an app based on the uploaded image requirements.",
    );
  });

  it("uses generic fallback when prompt is empty and has no images", () => {
    const result = deriveInitialChatMetadata({
      userTextContent: "",
      hasImages: false,
    });

    expect(result.title).toBe("New Chat");
    expect(result.description).toBe("Start building with Edward.");
  });
});
