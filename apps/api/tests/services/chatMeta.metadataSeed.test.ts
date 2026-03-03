import { describe, expect, it } from "vitest";
import { deriveInitialChatMetadata } from "../../services/chatMeta.service.js";

describe("chat metadata seed derivation", () => {
  it("returns image fallback when no text content exists", () => {
    expect(
      deriveInitialChatMetadata({ userTextContent: "   ", hasImages: true }),
    ).toEqual({
      title: "Image-based App Request",
      description: "Build an app based on the uploaded image requirements.",
    });
  });

  it("returns default fallback when no text and no image", () => {
    expect(
      deriveInitialChatMetadata({ userTextContent: "", hasImages: false }),
    ).toEqual({
      title: "New Chat",
      description: "Start building with Edward.",
    });
  });

  it("removes markdown and URLs before creating title and description", () => {
    const result = deriveInitialChatMetadata({
      userTextContent:
        "## Build [landing page](https://example.com) for AI startup\n- include pricing cards",
      hasImages: false,
    });

    expect(result.title).toBe("Build Landing Page For AI Startup");
    expect(result.description).toContain("Build landing page for AI startup include");
    expect(result.description).not.toContain("https://");
  });

  it("keeps acronyms and camel-case words in the title", () => {
    const result = deriveInitialChatMetadata({
      userTextContent: "build API gateway with OAuthFlow support and JWT validation",
      hasImages: false,
    });

    expect(result.title).toBe("Build API Gateway With OAuthFlow Support");
  });

  it("truncates title and description on word boundaries", () => {
    const longPrompt =
      "Create an enterprise dashboard with audit logging tenant-aware authorization granular reporting export controls and operational analytics for multiple stakeholder groups";

    const result = deriveInitialChatMetadata({
      userTextContent: longPrompt,
      hasImages: false,
    });

    expect(result.title.length).toBeLessThanOrEqual(100);
    expect(result.description.length).toBeLessThanOrEqual(200);
    expect(result.title.endsWith(" ")).toBe(false);
    expect(result.description.endsWith(" ")).toBe(false);
  });
});
