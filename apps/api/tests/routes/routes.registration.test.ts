import { beforeEach, describe, expect, it, vi } from "vitest";

type RouterLike = {
  stack: Array<{
    route?: {
      path: string;
      methods: Record<string, boolean>;
    };
  }>;
};

const refs = vi.hoisted(() => {
  const noop = (_req: unknown, _res: unknown, next: (err?: unknown) => void) => next();

  return {
    validateRequest: vi.fn(() => noop),
    apiKeyRateLimiter: noop,
    chatRateLimiter: noop,
    dailyChatRateLimiter: noop,
    dailyChatQuotaReadRateLimiter: noop,
    imageUploadRateLimiter: noop,
    promptEnhanceRateLimiter: noop,
    githubRateLimiter: noop,
    dailyGithubRateLimiter: noop,

    getApiKey: noop,
    createApiKey: noop,
    updateApiKey: noop,

    uploadChatImageUseCase: noop,
    unifiedSendMessage: noop,
    enhancePromptUseCase: noop,
    getChatHistory: noop,
    getChatMeta: noop,
    deleteChat: noop,
    getRecentChats: noop,
    getDailyChatQuota: noop,
    getBuildStatus: noop,
    streamBuildEvents: noop,
    getActiveRun: noop,
    streamRunEvents: noop,
    cancelRunHandler: noop,
    getSandboxFiles: noop,
    checkSubdomainAvailability: noop,
    updateChatSubdomain: noop,

    connectRepo: noop,
    createBranch: noop,
    syncRepo: noop,
    githubStatus: noop,
  };
});

vi.mock("../../middleware/validateRequest.js", () => ({
  validateRequest: refs.validateRequest,
}));

vi.mock("../../middleware/rateLimit.js", () => ({
  apiKeyRateLimiter: refs.apiKeyRateLimiter,
  chatRateLimiter: refs.chatRateLimiter,
  dailyChatRateLimiter: refs.dailyChatRateLimiter,
  dailyChatQuotaReadRateLimiter: refs.dailyChatQuotaReadRateLimiter,
  imageUploadRateLimiter: refs.imageUploadRateLimiter,
  promptEnhanceRateLimiter: refs.promptEnhanceRateLimiter,
  githubRateLimiter: refs.githubRateLimiter,
  dailyGithubRateLimiter: refs.dailyGithubRateLimiter,
}));

vi.mock("../../schemas/apiKey.schema.js", () => ({
  CreateApiKeyRequestSchema: {},
  UpdateApiKeyRequestSchema: {},
}));

vi.mock("../../schemas/chat.schema.js", () => ({
  GetChatHistoryRequestSchema: {},
  PromptEnhanceRequestSchema: {},
  UnifiedSendMessageRequestSchema: {},
  StreamRunEventsRequestSchema: {},
  CancelRunRequestSchema: {},
}));

vi.mock("../../schemas/github.schema.js", () => ({
  ConnectRepoRequestSchema: {},
  CreateBranchRequestSchema: {},
  GithubStatusRequestSchema: {},
  SyncRepoRequestSchema: {},
}));

vi.mock("../../services/apiKey/apiKey.useCase.js", () => ({
  getApiKey: refs.getApiKey,
  createApiKey: refs.createApiKey,
  updateApiKey: refs.updateApiKey,
}));

vi.mock("../../services/chat/imageUpload.useCase.js", () => ({
  uploadChatImageUseCase: refs.uploadChatImageUseCase,
}));

vi.mock("../../services/runs/messageOrchestrator.service.js", () => ({
  unifiedSendMessage: refs.unifiedSendMessage,
}));

vi.mock("../../services/chat/promptEnhance.useCase.js", () => ({
  enhancePromptUseCase: refs.enhancePromptUseCase,
}));

vi.mock("../../controllers/chat/query/history.controller.js", () => ({
  getChatHistory: refs.getChatHistory,
  getChatMeta: refs.getChatMeta,
  deleteChat: refs.deleteChat,
  getRecentChats: refs.getRecentChats,
  getDailyChatQuota: refs.getDailyChatQuota,
}));

vi.mock("../../controllers/chat/query/build.controller.js", () => ({
  getBuildStatus: refs.getBuildStatus,
  streamBuildEvents: refs.streamBuildEvents,
}));

vi.mock("../../controllers/chat/query/run.controller.js", () => ({
  getActiveRun: refs.getActiveRun,
  streamRunEvents: refs.streamRunEvents,
  cancelRunHandler: refs.cancelRunHandler,
}));

vi.mock("../../controllers/chat/query/sandbox.controller.js", () => ({
  getSandboxFiles: refs.getSandboxFiles,
}));

vi.mock("../../services/previewRouting/subdomainUpdate.service.js", () => ({
  checkSubdomainAvailability: refs.checkSubdomainAvailability,
  updateChatSubdomain: refs.updateChatSubdomain,
}));

vi.mock("../../services/github/github.useCase.js", () => ({
  connectRepo: refs.connectRepo,
  createBranch: refs.createBranch,
  syncRepo: refs.syncRepo,
  githubStatus: refs.githubStatus,
}));

function collectRouteSignatures(router: RouterLike): string[] {
  return router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => {
      const route = layer.route;
      if (!route) return [];
      return Object.keys(route.methods).map(
        (method) => `${method.toUpperCase()} ${route.path}`,
      );
    });
}

function assertRouterLike(router: unknown): asserts router is RouterLike {
  if (
    (typeof router !== "object" && typeof router !== "function") ||
    router === null ||
    !("stack" in router) ||
    !Array.isArray((router as { stack?: unknown }).stack)
  ) {
    throw new Error("Expected an Express router-like object with a stack array");
  }
}

function getRouteLayer(
  router: RouterLike,
  method: string,
  path: string,
): {
  route: {
    path: string;
    methods: Record<string, boolean>;
    stack?: Array<{ handle: unknown }>;
  };
} {
  const layer = router.stack.find(
    (candidate) =>
      candidate.route?.path === path &&
      candidate.route.methods[method.toLowerCase()] === true,
  );

  if (!layer?.route) {
    throw new Error(`Expected route ${method.toUpperCase()} ${path} to exist`);
  }

  return layer as {
    route: {
      path: string;
      methods: Record<string, boolean>;
      stack?: Array<{ handle: unknown }>;
    };
  };
}

describe("route registration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("registers API key routes", async () => {
    const { apiKeyRouter } = await import("../../routes/apiKey.routes.js");
    assertRouterLike(apiKeyRouter);
    const routes = collectRouteSignatures(apiKeyRouter);

    expect(routes).toEqual(["GET /", "POST /", "PUT /"]);
  });

  it("registers chat routes", async () => {
    const { chatRouter } = await import("../../routes/chat.routes.js");
    assertRouterLike(chatRouter);
    const routes = collectRouteSignatures(chatRouter);
    const dailyQuotaRoute = getRouteLayer(chatRouter, "get", "/quota/daily");

    expect(routes).toContain("POST /image-upload");
    expect(routes).toContain("POST /message");
    expect(routes).toContain("POST /prompt-enhance");
    expect(routes).toContain("GET /recent");
    expect(routes).toContain("GET /quota/daily");
    expect(routes).toContain("GET /:chatId/history");
    expect(routes).toContain("GET /:chatId/meta");
    expect(routes).toContain("GET /:chatId/build-status");
    expect(routes).toContain("GET /:chatId/active-run");
    expect(routes).toContain("GET /:chatId/build-events");
    expect(routes).toContain("GET /:chatId/runs/:runId/stream");
    expect(routes).toContain("POST /:chatId/runs/:runId/cancel");
    expect(routes).toContain("GET /:chatId/sandbox-files");
    expect(routes).toContain("DELETE /:chatId");
    expect(routes).toContain("GET /subdomain/check");
    expect(routes).toContain("PATCH /:chatId/subdomain");
    expect(dailyQuotaRoute.route.stack?.map((layer) => layer.handle)).toEqual([
      refs.dailyChatQuotaReadRateLimiter,
      refs.getDailyChatQuota,
    ]);
  });

  it("registers github routes", async () => {
    const { githubRouter } = await import("../../routes/github.routes.js");
    assertRouterLike(githubRouter);
    const routes = collectRouteSignatures(githubRouter);

    expect(routes).toEqual([
      "GET /status",
      "POST /connect",
      "POST /branch",
      "POST /sync",
    ]);
  });
});
