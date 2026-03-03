import { beforeEach, describe, expect, it, vi } from "vitest";

const getActiveSandboxMock = vi.fn();
const readAllProjectFilesMock = vi.fn();
const readProjectFilesFromS3Mock = vi.fn();
const loggerInfoMock = vi.fn();

vi.mock("../../../services/sandbox/lifecycle/provisioning.js", () => ({
  getActiveSandbox: getActiveSandboxMock,
}));

vi.mock("../../../services/sandbox/read.service.js", () => ({
  readAllProjectFiles: readAllProjectFilesMock,
}));

vi.mock("../../../services/sandbox/read/s3.readers.js", () => ({
  readProjectFilesFromS3: readProjectFilesFromS3Mock,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: {
    info: loggerInfoMock,
  },
}));

describe("sandbox query use-case", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reads from active sandbox when sandbox id exists", async () => {
    getActiveSandboxMock.mockResolvedValue("sandbox-1");
    readAllProjectFilesMock.mockResolvedValue(
      new Map([
        ["src/index.ts", "console.log('ok');"],
        ["src/app.ts", "export const app = true;"],
      ]),
    );

    const { getSandboxFilesUseCase } = await import(
      "../../../services/chat/query/sandbox.useCase.js"
    );

    const result = await getSandboxFilesUseCase({
      userId: "user-1",
      chatId: "chat-1",
    });

    expect(result).toEqual({
      sandboxId: "sandbox-1",
      files: [
        { path: "src/index.ts", content: "console.log('ok');", isComplete: true },
        { path: "src/app.ts", content: "export const app = true;", isComplete: true },
      ],
    });
    expect(readAllProjectFilesMock).toHaveBeenCalledWith("sandbox-1");
    expect(readProjectFilesFromS3Mock).not.toHaveBeenCalled();
  });

  it("falls back to storage reads when no active sandbox exists", async () => {
    getActiveSandboxMock.mockResolvedValue(null);
    readProjectFilesFromS3Mock.mockResolvedValue(
      new Map([["README.md", "# hello"]]),
    );

    const { getSandboxFilesUseCase } = await import(
      "../../../services/chat/query/sandbox.useCase.js"
    );

    const result = await getSandboxFilesUseCase({
      userId: "user-2",
      chatId: "chat-2",
    });

    expect(result).toEqual({
      sandboxId: null,
      files: [{ path: "README.md", content: "# hello", isComplete: true }],
    });
    expect(readProjectFilesFromS3Mock).toHaveBeenCalledWith(
      "user-2",
      "chat-2",
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      { chatId: "chat-2", userId: "user-2" },
      "No active sandbox, falling back to S3 for files",
    );
  });
});
