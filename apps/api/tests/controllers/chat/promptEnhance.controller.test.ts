import { beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "@edward/shared/constants";
import { Model } from "@edward/shared/schema";
import { HttpStatus } from "../../../utils/constants.js";

const mockRefs = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(() => "user-1"),
  getUserWithApiKey: vi.fn(),
  decrypt: vi.fn(),
  generateResponse: vi.fn(),
  sendError: vi.fn(),
  sendSuccess: vi.fn(),
  logger: {
    error: vi.fn(),
  },
  ensureError: vi.fn((error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ),
}));

vi.mock("../../../middleware/auth.js", () => ({
  getAuthenticatedUserId: mockRefs.getAuthenticatedUserId,
}));

vi.mock("../../../services/apiKey.service.js", () => ({
  getUserWithApiKey: mockRefs.getUserWithApiKey,
}));

vi.mock("../../../utils/encryption.js", () => ({
  decrypt: mockRefs.decrypt,
}));

vi.mock("../../../lib/llm/provider.client.js", () => ({
  generateResponse: mockRefs.generateResponse,
}));

vi.mock("../../../utils/response.js", () => ({
  sendError: mockRefs.sendError,
  sendSuccess: mockRefs.sendSuccess,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mockRefs.logger,
}));

vi.mock("../../../utils/error.js", () => ({
  ensureError: mockRefs.ensureError,
}));

describe("promptEnhance use case", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefs.getUserWithApiKey.mockResolvedValue({
      id: "user-1",
      apiKey: "encrypted",
      preferredModel: Model.GPT_5_3_CODEX,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRefs.decrypt.mockReturnValue("sk-proj-abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz");
    mockRefs.generateResponse.mockResolvedValue("Enhanced prompt output");
  });

  it("uses requested Gemini provider with cheapest Gemini model", async () => {
    mockRefs.decrypt.mockReturnValue("AIzaSyAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    const { enhancePromptUseCase } = await import(
      "../../../services/chat/promptEnhance.useCase.js"
    );

    const req = {
      body: {
        text: "Build a complete dashboard with charts, filters, and responsive interactions",
        provider: Provider.GEMINI,
      },
    } as never;
    const res = {} as never;

    await enhancePromptUseCase(req, res);

    expect(mockRefs.generateResponse).toHaveBeenCalledWith(
      "AIzaSyAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expect.any(String),
      undefined,
      expect.any(String),
      { model: Model.GEMINI_2_5_FLASH },
    );
    expect(mockRefs.sendSuccess).toHaveBeenCalledWith(
      res,
      HttpStatus.OK,
      "Prompt enhanced successfully",
      expect.objectContaining({
        provider: Provider.GEMINI,
        model: Model.GEMINI_2_5_FLASH,
      }),
    );
  });

  it("uses cheapest OpenAI model inferred from preferred model", async () => {
    const { enhancePromptUseCase } = await import(
      "../../../services/chat/promptEnhance.useCase.js"
    );

    const req = {
      body: {
        text: "Refactor this app for accessibility performance and robust type safety across all routes",
      },
    } as never;
    const res = {} as never;

    await enhancePromptUseCase(req, res);

    expect(mockRefs.generateResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      undefined,
      expect.any(String),
      { model: Model.GPT_5_NANO },
    );
  });

  it("uses Anthropic Sonnet 4.6 for prompt enhancement", async () => {
    mockRefs.decrypt.mockReturnValue("sk-ant-api03-validanthropickey1234567890");

    const { enhancePromptUseCase } = await import(
      "../../../services/chat/promptEnhance.useCase.js"
    );

    const req = {
      body: {
        text: "Rewrite this request into a clear build specification with explicit constraints, deliverables, implementation details, and success criteria for the coding agent",
        provider: Provider.ANTHROPIC,
      },
    } as never;
    const res = {} as never;

    await enhancePromptUseCase(req, res);

    expect(mockRefs.generateResponse).toHaveBeenCalledWith(
      "sk-ant-api03-validanthropickey1234567890",
      expect.any(String),
      undefined,
      expect.any(String),
      { model: Model.CLAUDE_SONNET_4_6 },
    );
    expect(mockRefs.sendSuccess).toHaveBeenCalledWith(
      res,
      HttpStatus.OK,
      "Prompt enhanced successfully",
      expect.objectContaining({
        provider: Provider.ANTHROPIC,
        model: Model.CLAUDE_SONNET_4_6,
      }),
    );
  });

  it("rejects provider and API key mismatch", async () => {
    mockRefs.decrypt.mockReturnValue("sk-proj-abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz");

    const { enhancePromptUseCase } = await import(
      "../../../services/chat/promptEnhance.useCase.js"
    );

    const req = {
      body: {
        text: "Improve this prompt with concrete deliverables constraints and technical scope details",
        provider: Provider.GEMINI,
      },
    } as never;
    const res = {} as never;

    await enhancePromptUseCase(req, res);

    expect(mockRefs.generateResponse).not.toHaveBeenCalled();
    expect(mockRefs.sendError).toHaveBeenCalledWith(
      res,
      HttpStatus.BAD_REQUEST,
      "Selected provider is incompatible with the saved API key.",
    );
  });

  it("rejects unsupported provider values", async () => {
    const { enhancePromptUseCase } = await import(
      "../../../services/chat/promptEnhance.useCase.js"
    );

    const req = {
      body: {
        text: "Improve this prompt with concrete acceptance criteria and clear technical constraints",
        provider: "mistral",
      },
    } as never;
    const res = {} as never;

    await enhancePromptUseCase(req, res);

    expect(mockRefs.generateResponse).not.toHaveBeenCalled();
    expect(mockRefs.sendError).toHaveBeenCalledWith(
      res,
      HttpStatus.BAD_REQUEST,
      "Selected provider is unsupported for prompt enhancement.",
    );
  });
});
