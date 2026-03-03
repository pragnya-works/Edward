import { beforeEach, describe, expect, it, vi } from "vitest";

type MockApp = {
  set: ReturnType<typeof vi.fn>;
  use: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

const refs = vi.hoisted(() => {
  const createAppMock = (): MockApp => {
    const app: MockApp = {
      set: vi.fn(() => app),
      use: vi.fn(() => app),
      get: vi.fn(() => app),
    };
    return app;
  };

  const appRef: { current: MockApp } = { current: createAppMock() };
  const expressMock = vi.fn(() => appRef.current);
  (expressMock as unknown as Record<string, unknown>).json = vi.fn(
    () => "json-parser-middleware",
  );
  (expressMock as unknown as Record<string, unknown>).urlencoded = vi.fn(
    () => "urlencoded-parser-middleware",
  );

  return {
    appRef,
    createAppMock,
    expressMock,
    corsOptions: null as null | {
      origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void;
    },
    corsMock: vi.fn((options) => {
      refs.corsOptions = options;
      return "cors-middleware";
    }),
    cookieParserMock: vi.fn(() => "cookie-parser-middleware"),
    helmetMock: vi.fn(() => "helmet-middleware"),
    sentry: {
      captureException: vi.fn(),
    },
    apiKeyRouter: "api-key-router",
    chatRouter: "chat-router",
    githubRouter: "github-router",
    authMiddleware: "auth-middleware",
    apiKeyRateLimiter: "api-key-rate-limiter",
    securityTelemetryMiddleware: "security-telemetry-middleware",
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
    ensureError: vi.fn((error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
    ),
  };
});

vi.mock("express", () => ({
  default: refs.expressMock,
}));

vi.mock("cors", () => ({
  default: refs.corsMock,
}));

vi.mock("cookie-parser", () => ({
  default: refs.cookieParserMock,
}));

vi.mock("helmet", () => ({
  default: refs.helmetMock,
}));

vi.mock("../../../utils/sentry.js", () => ({
  captureException: refs.sentry.captureException,
}));

vi.mock("../../../routes/apiKey.routes.js", () => ({
  apiKeyRouter: refs.apiKeyRouter,
}));

vi.mock("../../../routes/chat.routes.js", () => ({
  chatRouter: refs.chatRouter,
}));

vi.mock("../../../routes/github.routes.js", () => ({
  githubRouter: refs.githubRouter,
}));

vi.mock("../../../middleware/auth.js", () => ({
  authMiddleware: refs.authMiddleware,
}));

vi.mock("../../../middleware/rateLimit.js", () => ({
  apiKeyRateLimiter: refs.apiKeyRateLimiter,
}));

vi.mock("../../../middleware/securityTelemetry.js", () => ({
  securityTelemetryMiddleware: refs.securityTelemetryMiddleware,
}));

vi.mock("../../../utils/logger.js", () => ({
  createLogger: vi.fn(() => refs.logger),
}));

vi.mock("../../../utils/error.js", () => ({
  ensureError: refs.ensureError,
}));

describe("createHttpApp", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    refs.appRef.current = refs.createAppMock();
    refs.corsOptions = null;
  });

  it("wires middleware/routes and serves health + error handlers", async () => {
    const { createHttpApp } = await import("../../../server/http/app.factory.js");

    const app = createHttpApp({
      isDev: true,
      isProd: false,
      allowedOrigins: ["https://allowed.example.com"],
      environment:
        "development" as unknown as import("../../../utils/logger.js").Environment,
      trustProxy: 1,
    });

    expect(app).toBe(refs.appRef.current as never);
    expect(refs.appRef.current.set).toHaveBeenCalledWith("trust proxy", 1);

    expect(refs.appRef.current.use).toHaveBeenCalledWith(
      "/api-key",
      refs.authMiddleware,
      refs.apiKeyRateLimiter,
      refs.apiKeyRouter,
    );
    expect(refs.appRef.current.use).toHaveBeenCalledWith(
      "/chat",
      refs.authMiddleware,
      refs.chatRouter,
    );
    expect(refs.appRef.current.use).toHaveBeenCalledWith(
      "/github",
      refs.authMiddleware,
      refs.githubRouter,
    );

    const healthCall = refs.appRef.current.get.mock.calls.find(
      ([path]) => path === "/health",
    );
    const healthHandler = healthCall?.[1] as
      | ((req: unknown, res: { status: (code: number) => { json: (payload: unknown) => void } }) => void)
      | undefined;
    expect(healthHandler).toBeTypeOf("function");

    const healthStatus = vi.fn(() => ({ json: vi.fn() }));
    healthHandler?.({}, { status: healthStatus });
    expect(healthStatus).toHaveBeenCalledWith(200);

    const notFoundHandler = refs.appRef.current.use.mock.calls
      .map(([arg]) => arg)
      .find((arg) => typeof arg === "function" && arg.length === 2) as
      | ((req: unknown, res: { status: (code: number) => { json: (payload: unknown) => void } }) => void)
      | undefined;
    expect(notFoundHandler).toBeTypeOf("function");
    const notFoundStatus = vi.fn(() => ({ json: vi.fn() }));
    notFoundHandler?.({}, { status: notFoundStatus });
    expect(notFoundStatus).toHaveBeenCalledWith(404);

    const errorHandler = refs.appRef.current.use.mock.calls
      .map(([arg]) => arg)
      .find((arg) => typeof arg === "function" && arg.length === 4) as
      | ((err: unknown, req: unknown, res: { status: (code: number) => { json: (payload: unknown) => void } }, next: () => void) => void)
      | undefined;
    expect(errorHandler).toBeTypeOf("function");

    const errorStatus = vi.fn(() => ({ json: vi.fn() }));
    errorHandler?.(new Error("boom"), {}, { status: errorStatus }, vi.fn());
    expect(refs.logger.error).toHaveBeenCalledTimes(1);
    expect(refs.sentry.captureException).toHaveBeenCalledTimes(1);
    expect(errorStatus).toHaveBeenCalledWith(500);
  });

  it("enforces HTTPS in production and validates CORS allowlist", async () => {
    const { createHttpApp } = await import("../../../server/http/app.factory.js");

    createHttpApp({
      isDev: false,
      isProd: true,
      allowedOrigins: ["https://allowed.example.com"],
      environment:
        "production" as unknown as import("../../../utils/logger.js").Environment,
      trustProxy: true,
    });

    const forceHttpsMiddleware = refs.appRef.current.use.mock.calls
      .map(([arg]) => arg)
      .find((arg) => typeof arg === "function" && arg.name === "forceHttpsMiddleware") as
      | ((req: { secure: boolean; header: (name: string) => string | undefined; hostname?: string; originalUrl: string }, res: { status: (code: number) => { json: (payload: unknown) => void }; redirect: (status: number, url: string) => void }, next: () => void) => void)
      | undefined;
    expect(forceHttpsMiddleware).toBeTypeOf("function");

    const redirect = vi.fn();
    forceHttpsMiddleware?.(
      {
        secure: false,
        header: vi.fn(() => "http"),
        hostname: "api.example.com",
        originalUrl: "/chat",
      },
      {
        status: vi.fn(() => ({ json: vi.fn() })),
        redirect,
      },
      vi.fn(),
    );
    expect(redirect).toHaveBeenCalledWith(301, "https://api.example.com/chat");

    const status = vi.fn(() => ({ json: vi.fn() }));
    forceHttpsMiddleware?.(
      {
        secure: false,
        header: vi.fn(() => "http"),
        hostname: "",
        originalUrl: "/chat",
      },
      {
        status,
        redirect: vi.fn(),
      },
      vi.fn(),
    );
    expect(status).toHaveBeenCalledWith(400);

    expect(refs.corsOptions).toBeTruthy();
    let allowed = false;
    refs.corsOptions?.origin("https://allowed.example.com", (error, isAllowed) => {
      expect(error).toBeNull();
      allowed = Boolean(isAllowed);
    });
    expect(allowed).toBe(true);

    refs.corsOptions?.origin("https://blocked.example.com", (error) => {
      expect(error).toBeInstanceOf(Error);
    });
  });
});
