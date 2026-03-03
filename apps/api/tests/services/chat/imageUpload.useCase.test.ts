import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import { HttpStatus } from "../../../utils/constants.js";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(() => "user-1"),
  uploadUserImageToCdn: vi.fn(),
  validateImageBuffer: vi.fn(),
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
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));

vi.mock("../../../services/storage/cdnAssets.service.js", () => ({
  uploadUserImageToCdn: mocks.uploadUserImageToCdn,
}));

vi.mock("../../../utils/imageValidation/binary.js", () => ({
  validateImageBuffer: mocks.validateImageBuffer,
}));

vi.mock("../../../utils/response.js", () => ({
  sendError: mocks.sendError,
  sendSuccess: mocks.sendSuccess,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mocks.logger,
}));

vi.mock("../../../utils/error.js", () => ({
  ensureError: mocks.ensureError,
}));

function createRequest(input: {
  headers: Record<string, string>;
  body: unknown;
}): AuthenticatedRequest {
  return {
    headers: input.headers,
    body: input.body,
  } as unknown as AuthenticatedRequest;
}

function createResponseStub(): Response {
  return {} as Response;
}

describe("image upload use case", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateImageBuffer.mockReturnValue({
      success: true,
      data: { mimeType: "image/png", sizeBytes: 12 },
    });
    mocks.uploadUserImageToCdn.mockResolvedValue({
      url: "https://cdn.example/image.png",
      key: "images/image.png",
    });
  });

  it("rejects unsupported mime types", async () => {
    const { uploadChatImageUseCase } = await import(
      "../../../services/chat/imageUpload.useCase.js"
    );

    await uploadChatImageUseCase(
      createRequest({
        headers: { "content-type": "text/plain" },
        body: Buffer.from("abc"),
      }),
      createResponseStub(),
    );

    expect(mocks.sendError).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.BAD_REQUEST,
      expect.stringContaining("Unsupported image type"),
    );
  });

  it("uploads validated image payload", async () => {
    const { uploadChatImageUseCase } = await import(
      "../../../services/chat/imageUpload.useCase.js"
    );

    await uploadChatImageUseCase(
      createRequest({
        headers: {
          "content-type": "image/png",
          "x-file-name": "mock.png",
        },
        body: Buffer.from("abc"),
      }),
      createResponseStub(),
    );

    expect(mocks.uploadUserImageToCdn).toHaveBeenCalledWith(
      "user-1",
      expect.any(Buffer),
      "image/png",
      "mock.png",
    );
    expect(mocks.sendSuccess).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.CREATED,
      "Image uploaded successfully",
      expect.objectContaining({ url: "https://cdn.example/image.png" }),
    );
  });

  it("rejects empty image payloads for valid image content types", async () => {
    const { uploadChatImageUseCase } = await import(
      "../../../services/chat/imageUpload.useCase.js"
    );

    await uploadChatImageUseCase(
      createRequest({
        headers: { "content-type": "image/png" },
        body: Buffer.alloc(0),
      }),
      createResponseStub(),
    );

    expect(mocks.sendError).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.BAD_REQUEST,
      "Image payload is empty.",
    );
    expect(mocks.uploadUserImageToCdn).not.toHaveBeenCalled();
  });

  it("returns validator errors without attempting CDN upload", async () => {
    const { uploadChatImageUseCase } = await import(
      "../../../services/chat/imageUpload.useCase.js"
    );
    mocks.validateImageBuffer.mockReturnValueOnce({
      success: false,
      error: { message: "Invalid image payload" },
    });

    await uploadChatImageUseCase(
      createRequest({
        headers: { "content-type": "image/png" },
        body: Buffer.from("abc"),
      }),
      createResponseStub(),
    );

    expect(mocks.sendError).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.BAD_REQUEST,
      "Invalid image payload",
    );
    expect(mocks.uploadUserImageToCdn).not.toHaveBeenCalled();
  });
});
