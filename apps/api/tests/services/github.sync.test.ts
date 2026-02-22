import { describe, it, expect, vi, beforeEach, afterEach, Mocked } from "vitest";
import { db } from "@edward/auth";
import { syncChatToGithub } from "../../services/github.service.js";
import * as syncUtils from "../../services/github/sync.utils.js";
import * as provisioning from "../../services/sandbox/lifecycle/provisioning.js";
import * as storage from "../../services/storage.service.js";
import * as archive from "../../services/sandbox/backup/archive.js";
import * as githubClient from "@edward/octokit";
import { Readable } from "stream";
import { encrypt } from "../../utils/encryption.js";

interface MockedDb {
  select: Mocked<() => MockedDb>;
  from: Mocked<() => MockedDb>;
  where: Mocked<() => MockedDb>;
  limit: Mocked<(n: number) => Promise<unknown[]>>;
}

vi.mock("@edward/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@edward/auth")>("@edward/auth");
  return {
    ...actual,
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    },
    chat: {
      id: "chat_id",
      userId: "user_id",
      githubRepoFullName: "githubRepoFullName",
    },
    account: {
      userId: "userId",
      providerId: "providerId",
      accessToken: "accessToken",
    },
  };
});

vi.mock("@edward/octokit", () => ({
  createGithubClient: vi.fn(() => ({
    rest: {
      repos: {
        get: vi.fn().mockResolvedValue({
          data: {
            private: true,
            permissions: { push: true },
          },
        }),
      },
    },
  })),
  syncFiles: vi.fn().mockResolvedValue({ sha: "mock-sha", changed: true }),
}));

vi.mock("../../services/sandbox/lifecycle/provisioning.js", () => ({
  getActiveSandbox: vi.fn(),
}));

vi.mock("../../services/github/sync.utils.js", () => ({
  extractFilesFromStream: vi
    .fn()
    .mockResolvedValue([{ path: "test.txt", content: "hello" }]),
}));

vi.mock("../../services/storage.service.js", async () => {
  return {
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
    deleteFolder: vi.fn(),
  };
});

vi.mock("../../services/sandbox/state.sandbox.js", () => ({
  getSandboxState: vi.fn().mockResolvedValue({ containerId: "mock-container" }),
}));

vi.mock("../../services/sandbox/docker.sandbox.js", () => ({
  getContainer: vi.fn().mockReturnValue({}),
}));

vi.mock("../../services/sandbox/backup/archive.js", () => ({
  createBackupArchive: vi.fn(),
}));

vi.mock("../../services/storage/config.js", () => ({
  isS3Configured: vi.fn().mockReturnValue(true),
  BUCKET_NAME: "test-bucket",
  s3Client: {},
}));

describe("github sync service", () => {
  const mockChatId = "chat-123";
  const mockUserId = "user-456";
  const mockBranch = "main";
  const mockMessage = "test commit";
  const mockedDb = db as unknown as MockedDb;
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const dbMock = vi.mocked(mockedDb.limit);
    dbMock.mockImplementation((() => {
      const callCount = dbMock.mock.calls.length;
      if (callCount === 1)
        return Promise.resolve([{ accessToken: `enc:v1:${encrypt("mock-token")}` }]);
      return Promise.resolve([{ repoFullName: "owner/repo" }]);
    }) as () => Promise<{ accessToken: string }[] | { repoFullName: string }[]>);
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  });

  it("should sync from active sandbox if available", async () => {
    vi.mocked(provisioning.getActiveSandbox).mockResolvedValue("sandbox-789");

    vi.mocked(archive.createBackupArchive).mockResolvedValue({
      uploadStream: new Readable({
        read() {
          this.push(null);
        },
      }),
      completion: Promise.resolve(true),
    });

    const result = await syncChatToGithub(
      mockChatId,
      mockUserId,
      mockBranch,
      mockMessage,
    );

    expect(result.sha).toBe("mock-sha");
    expect(provisioning.getActiveSandbox).toHaveBeenCalledWith(mockChatId);
    expect(syncUtils.extractFilesFromStream).toHaveBeenCalled();
  });

  it("should report noChanges when remote branch already matches local files", async () => {
    vi.mocked(provisioning.getActiveSandbox).mockResolvedValue("sandbox-789");
    vi.mocked(githubClient.syncFiles).mockResolvedValueOnce({
      sha: "existing-sha",
      changed: false,
    });

    vi.mocked(archive.createBackupArchive).mockResolvedValue({
      uploadStream: new Readable({
        read() {
          this.push(null);
        },
      }),
      completion: Promise.resolve(true),
    });

    const result = await syncChatToGithub(
      mockChatId,
      mockUserId,
      mockBranch,
      mockMessage,
    );

    expect(result.sha).toBe("existing-sha");
    expect(result.noChanges).toBe(true);
  });

  it("should fallback to S3 if no active sandbox is found", async () => {
    vi.mocked(provisioning.getActiveSandbox).mockResolvedValue(undefined);
    vi.mocked(storage.downloadFile).mockResolvedValue(
      new Readable({
        read() {
          this.push(null);
        },
      }),
    );

    const result = await syncChatToGithub(
      mockChatId,
      mockUserId,
      mockBranch,
      mockMessage,
    );

    expect(result.sha).toBe("mock-sha");
    expect(provisioning.getActiveSandbox).toHaveBeenCalledWith(mockChatId);
    expect(storage.downloadFile).toHaveBeenCalled();
    expect(syncUtils.extractFilesFromStream).toHaveBeenCalled();
  });

  it("should throw error if no active sandbox and no S3 backup found", async () => {
    vi.mocked(provisioning.getActiveSandbox).mockResolvedValue(undefined);
    vi.mocked(storage.downloadFile).mockResolvedValue(null);

    await expect(
      syncChatToGithub(mockChatId, mockUserId, mockBranch, mockMessage),
    ).rejects.toThrow(
      "GitHub sync failed: No active sandbox or previous backup found to sync",
    );
  });
});
