import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRefs = vi.hoisted(() => {
  return {
    deploymentType: "subdomain" as "path" | "subdomain",
    sandbox: {
      id: "sandbox-1",
      containerId: "container-1",
      userId: "user-1",
      chatId: "chat-1",
      scaffoldedFramework: "vite-react",
      requestedPackages: [],
      expiresAt: Date.now() + 3600_000,
    },
    uploadResult: {
      successful: 3,
      totalFiles: 3,
      uploadedKeys: new Set<string>(),
    },
    routingResult: {
      subdomain: "bright-wolf-abc12",
      previewUrl: "https://bright-wolf-abc12.edwardd.app",
      storagePrefix: "user-1/chat-1",
    } as {
      subdomain: string;
      previewUrl: string;
      storagePrefix: string;
    } | null,
    routeThrows: false,
    pathPreviewUrl: "https://cdn.edwardd.app/user-1/chat-1/",
    disconnectMock: vi.fn().mockResolvedValue(undefined),
    connectMock: vi.fn().mockResolvedValue(undefined),
    execCommandMock: vi.fn(),
    getContainerMock: vi.fn().mockReturnValue({ id: "container-1" }),
    getSandboxStateMock: vi.fn(),
    saveSandboxStateMock: vi.fn().mockResolvedValue(undefined),
    runUnifiedBuildMock: vi.fn(),
    uploadBuildFilesToS3Mock: vi.fn(),
    uploadSpaFallbackMock: vi.fn().mockResolvedValue(undefined),
    buildPreviewUrlMock: vi.fn(),
    cleanupS3FolderExceptMock: vi.fn().mockResolvedValue(undefined),
    buildS3KeyMock: vi.fn(),
    mergeAndInstallDependenciesMock: vi.fn(),
    invalidatePreviewCacheMock: vi.fn().mockResolvedValue(undefined),
    registerPreviewSubdomainMock: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock("../../../../services/sandbox/docker.sandbox.js", () => ({
  connectToNetwork: mockRefs.connectMock,
  getContainer: mockRefs.getContainerMock,
  execCommand: mockRefs.execCommandMock,
  CONTAINER_WORKDIR: "/home/node/edward",
}));

vi.mock("../../../../services/sandbox/state.sandbox.js", () => ({
  getSandboxState: mockRefs.getSandboxStateMock,
  saveSandboxState: mockRefs.saveSandboxStateMock,
}));

vi.mock("../../../../utils/logger.js", () => ({
  logger: mockRefs.logger,
  createLogger: vi.fn(() => mockRefs.logger),
}));

vi.mock("../../../../utils/error.js", () => ({
  ensureError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
}));

vi.mock("../../../../services/builder.service.js", () => ({
  runUnifiedBuild: mockRefs.runUnifiedBuildMock,
}));

vi.mock("../../../../services/sandbox/upload.sandbox.js", () => ({
  uploadBuildFilesToS3: mockRefs.uploadBuildFilesToS3Mock,
  uploadSpaFallback: mockRefs.uploadSpaFallbackMock,
}));

vi.mock("../../../../services/preview.service.js", () => ({
  buildPreviewUrl: mockRefs.buildPreviewUrlMock,
}));

vi.mock("../../../../services/storage.service.js", () => ({
  cleanupS3FolderExcept: mockRefs.cleanupS3FolderExceptMock,
}));

vi.mock("../../../../services/storage/key.utils.js", () => ({
  buildS3Key: mockRefs.buildS3KeyMock,
}));

vi.mock("../../../../config.js", () => ({
  DEPLOYMENT_TYPES: {
    PATH: "path",
    SUBDOMAIN: "subdomain",
  },
  config: {
    deployment: {
      get type() {
        return mockRefs.deploymentType;
      },
    },
  },
}));

vi.mock("../../../../services/sandbox/utils.sandbox.js", () => ({
  disconnectContainerFromNetwork: mockRefs.disconnectMock,
  TIMEOUT_DEPENDENCY_INSTALL_MS: 60_000,
}));

vi.mock("../../../../services/sandbox/templates/dependency.merger.js", () => ({
  mergeAndInstallDependencies: mockRefs.mergeAndInstallDependenciesMock,
}));

vi.mock("../../../../services/storage/cdn.js", () => ({
  invalidatePreviewCache: mockRefs.invalidatePreviewCacheMock,
}));

vi.mock("../../../../services/sandbox/templates/template.registry.js", () => ({
  normalizeFramework: (framework: string) => framework,
}));

vi.mock("../../../../services/previewRouting.service.js", () => ({
  registerPreviewSubdomain: mockRefs.registerPreviewSubdomainMock,
}));

// Mock @edward/auth so the DB lookup for customSubdomain doesn't need a real DB
vi.mock("@edward/auth", async () => {
  const chainMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ customSubdomain: null }]),
  };
  return {
    db: chainMock,
    chat: {},
    eq: vi.fn(),
  };
});

import { buildAndUploadUnified } from "../../../../services/sandbox/builder/unified.build.js";

function setupCommonMocks() {
  mockRefs.getSandboxStateMock.mockResolvedValue({ ...mockRefs.sandbox });

  mockRefs.execCommandMock.mockImplementation(
    async (_container: unknown, command: string[]) => {
      if (command[0] === "which" && command[1] === "pnpm") {
        return { exitCode: 0, stdout: "/usr/bin/pnpm", stderr: "" };
      }

      if (
        command[0] === "test" &&
        command[1] === "-d" &&
        command[2] === "node_modules"
      ) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      return { exitCode: 0, stdout: "", stderr: "" };
    },
  );

  mockRefs.mergeAndInstallDependenciesMock.mockResolvedValue({ success: true });

  mockRefs.runUnifiedBuildMock.mockResolvedValue({
    success: true,
    outputInfo: { directory: "dist" },
  });

  mockRefs.uploadBuildFilesToS3Mock.mockResolvedValue({
    successful: mockRefs.uploadResult.successful,
    totalFiles: mockRefs.uploadResult.totalFiles,
    uploadedKeys: new Set(mockRefs.uploadResult.uploadedKeys),
  });

  mockRefs.buildS3KeyMock.mockImplementation(
    (userId: string, chatId: string, suffix?: string) =>
      suffix ? `${userId}/${chatId}/${suffix}` : `${userId}/${chatId}`,
  );

  mockRefs.buildPreviewUrlMock.mockReturnValue(mockRefs.pathPreviewUrl);

  mockRefs.registerPreviewSubdomainMock.mockImplementation(async () => {
    if (mockRefs.routeThrows) {
      throw new Error("routing failed");
    }
    return mockRefs.routingResult;
  });
}

describe("buildAndUploadUnified preview URL routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRefs.deploymentType = "subdomain";
    mockRefs.uploadResult = {
      successful: 3,
      totalFiles: 3,
      uploadedKeys: new Set<string>(),
    };
    mockRefs.routingResult = {
      subdomain: "bright-wolf-abc12",
      previewUrl: "https://bright-wolf-abc12.edwardd.app",
      storagePrefix: "user-1/chat-1",
    };
    mockRefs.routeThrows = false;
    mockRefs.pathPreviewUrl = "https://cdn.edwardd.app/user-1/chat-1/";

    setupCommonMocks();
  });

  it("uses subdomain URL when routing registration succeeds", async () => {
    const result = await buildAndUploadUnified("sandbox-1");

    expect(result.success).toBe(true);
    expect(result.previewUploaded).toBe(true);
    expect(result.previewUrl).toBe("https://bright-wolf-abc12.edwardd.app");
    expect(result.error).toBeUndefined();
    expect(mockRefs.registerPreviewSubdomainMock).toHaveBeenCalledWith(
      "user-1",
      "chat-1",
      null,
    );
  });

  it("falls back to path preview URL when routing config is incomplete", async () => {
    mockRefs.routingResult = null;

    const result = await buildAndUploadUnified("sandbox-1");

    expect(result.success).toBe(true);
    expect(result.previewUploaded).toBe(true);
    expect(result.previewUrl).toBe("https://cdn.edwardd.app/user-1/chat-1/");
    expect(result.error).toContain("subdomain routing is unavailable");
  });

  it("falls back to path URL and preserves both warnings on routing failure + partial upload", async () => {
    mockRefs.routeThrows = true;
    mockRefs.uploadResult = {
      successful: 2,
      totalFiles: 3,
      uploadedKeys: new Set<string>(),
    };
    mockRefs.uploadBuildFilesToS3Mock.mockResolvedValue({
      successful: 2,
      totalFiles: 3,
      uploadedKeys: new Set<string>(),
    });

    const result = await buildAndUploadUnified("sandbox-1");

    expect(result.success).toBe(true);
    expect(result.previewUploaded).toBe(true);
    expect(result.previewUrl).toBe("https://cdn.edwardd.app/user-1/chat-1/");
    expect(result.error).toContain("subdomain routing failed");
    expect(result.error).toContain("files failed to upload to S3");
  });
});
