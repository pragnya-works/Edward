import { beforeEach, describe, expect, it, vi } from "vitest";
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
      {
        headers: { "content-type": "text/plain" },
        body: Buffer.from("abc"),
      } as never,
      {} as never,
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
      {
        headers: {
          "content-type": "image/png",
          "x-file-name": "mock.png",
        },
        body: Buffer.from("abc"),
      } as never,
      {} as never,
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
});
