import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "../../../utils/logger.js";
import { Environment as LoggerEnvironment } from "../../../utils/logger.js";

type MockApp = {
  set: ReturnType<typeof vi.fn>;
  use: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

type HealthResponse = {
  status: (code: number) => { json: (payload: unknown) => void };
};

type ErrorResponse = HealthResponse & {
  redirect: (status: number, url: string) => void;
};

type ForceHttpsRequest = {
  secure: boolean;
  header: (name: string) => string | undefined;
  hostname?: string;
  originalUrl: string;
};

function assertFunction<T extends (...args: never[]) => unknown>(
  value: unknown,
  name: string,
): asserts value is T {
  if (typeof value !== "function") {
    throw new Error(`Expected ${name} to be a function`);
  }
}

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
  const expressMock = Object.assign(vi.fn(() => appRef.current), {
    json: vi.fn(
      () => "json-parser-middleware",
    ),
    urlencoded: vi.fn(
      () => "urlencoded-parser-middleware",
    ),
  });

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
    dbMock: {
      select: vi.fn(),
      from: vi.fn(),
      limit: vi.fn(),
    },
    user: {
      id: "id",
    },
    redis: {
      ping: vi.fn(),
    },
    sandboxControl: {
      isSandboxEnabled: vi.fn(),
      isSandboxRuntimeAvailable: vi.fn(),
    },
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
  Environment: {
    Development: "development",
    Production: "production",
    Test: "test",
  },
  createLogger: vi.fn(() => refs.logger),
}));

vi.mock("../../../utils/error.js", () => ({
  ensureError: refs.ensureError,
}));

vi.mock("@edward/auth", () => ({
  db: {
    select: refs.dbMock.select,
  },
  user: refs.user,
}));

vi.mock("../../../lib/redis.js", () => ({
  redis: refs.redis,
}));

vi.mock("../../../services/sandbox/lifecycle/control.js", () => ({
  isSandboxEnabled: refs.sandboxControl.isSandboxEnabled,
  isSandboxRuntimeAvailable: refs.sandboxControl.isSandboxRuntimeAvailable,
}));

describe("createHttpApp", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    refs.appRef.current = refs.createAppMock();
    refs.corsOptions = null;
    refs.dbMock.select.mockReturnValue({
      from: refs.dbMock.from,
    });
    refs.dbMock.from.mockReturnValue({
      limit: refs.dbMock.limit,
    });
    refs.dbMock.limit.mockResolvedValue([]);
    refs.redis.ping.mockResolvedValue("PONG");
    refs.sandboxControl.isSandboxEnabled.mockReturnValue(true);
    refs.sandboxControl.isSandboxRuntimeAvailable.mockResolvedValue(true);
  });

  it("wires middleware/routes and serves health + error handlers", async () => {
    const { createHttpApp } = await import("../../../server/http/app.factory.js");
    const environment: Environment = LoggerEnvironment.Development;

    const app = createHttpApp({
      isDev: true,
      isProd: false,
      allowedOrigins: ["https://allowed.example.com"],
      environment,
      trustProxy: 1,
      apiBasePath: "",
    });

    expect(app).toBe(refs.appRef.current);
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
    const healthHandler = healthCall?.[1];
    assertFunction<(req: unknown, res: HealthResponse) => void>(
      healthHandler,
      "healthHandler",
    );
    expect(healthHandler).toBeTypeOf("function");

    const healthStatus = vi.fn(() => ({ json: vi.fn() }));
    healthHandler({}, { status: healthStatus });
    expect(healthStatus).toHaveBeenCalledWith(200);

    const readyCall = refs.appRef.current.get.mock.calls.find(
      ([path]) => path === "/ready",
    );
    const readyHandler = readyCall?.[1];
    assertFunction<(req: unknown, res: HealthResponse) => Promise<void>>(
      readyHandler,
      "readyHandler",
    );
    const readyStatus = vi.fn(() => ({ json: vi.fn() }));
    await readyHandler({}, { status: readyStatus });
    expect(readyStatus).toHaveBeenCalledWith(200);

    const notFoundHandler = refs.appRef.current.use.mock.calls
      .map(([arg]) => arg)
      .find((arg) => typeof arg === "function" && arg.length === 2);
    assertFunction<(req: unknown, res: HealthResponse) => void>(
      notFoundHandler,
      "notFoundHandler",
    );
    expect(notFoundHandler).toBeTypeOf("function");
    const notFoundStatus = vi.fn(() => ({ json: vi.fn() }));
    notFoundHandler({}, { status: notFoundStatus });
    expect(notFoundStatus).toHaveBeenCalledWith(404);

    const errorHandler = refs.appRef.current.use.mock.calls
      .map(([arg]) => arg)
      .find((arg) => typeof arg === "function" && arg.length === 4);
    assertFunction<
      (
        err: unknown,
        req: unknown,
        res: HealthResponse,
        next: () => void,
      ) => void
    >(errorHandler, "errorHandler");
    expect(errorHandler).toBeTypeOf("function");

    const errorStatus = vi.fn(() => ({ json: vi.fn() }));
    errorHandler(new Error("boom"), {}, { status: errorStatus }, vi.fn());
    expect(refs.logger.error).toHaveBeenCalledTimes(1);
    expect(refs.sentry.captureException).toHaveBeenCalledTimes(1);
    expect(errorStatus).toHaveBeenCalledWith(500);
  });

  it("enforces HTTPS in production and validates CORS allowlist", async () => {
    const { createHttpApp } = await import("../../../server/http/app.factory.js");
    const environment: Environment = LoggerEnvironment.Production;

    createHttpApp({
      isDev: false,
      isProd: true,
      allowedOrigins: ["https://allowed.example.com"],
      environment,
      trustProxy: true,
      apiBasePath: "",
    });

    const forceHttpsMiddleware = refs.appRef.current.use.mock.calls
      .map(([arg]) => arg)
      .find((arg) => typeof arg === "function" && arg.name === "forceHttpsMiddleware");
    assertFunction<
      (
        req: ForceHttpsRequest,
        res: ErrorResponse,
        next: () => void,
      ) => void
    >(forceHttpsMiddleware, "forceHttpsMiddleware");
    expect(forceHttpsMiddleware).toBeTypeOf("function");

    const redirect = vi.fn();
    forceHttpsMiddleware(
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
    expect(redirect).toHaveBeenCalledWith(308, "https://api.example.com/chat");

    const status = vi.fn(() => ({ json: vi.fn() }));
    forceHttpsMiddleware(
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

    const healthNext = vi.fn();
    const healthRedirect = vi.fn();
    forceHttpsMiddleware(
      {
        secure: false,
        header: vi.fn(() => "http"),
        hostname: "api.example.com",
        originalUrl: "/health?probe=1",
      },
      {
        status: vi.fn(() => ({ json: vi.fn() })),
        redirect: healthRedirect,
      },
      healthNext,
    );
    expect(healthRedirect).not.toHaveBeenCalled();
    expect(healthNext).toHaveBeenCalledTimes(1);

    const readyNext = vi.fn();
    const readyRedirect = vi.fn();
    forceHttpsMiddleware(
      {
        secure: false,
        header: vi.fn(() => "http"),
        hostname: "api.example.com",
        originalUrl: "/ready",
      },
      {
        status: vi.fn(() => ({ json: vi.fn() })),
        redirect: readyRedirect,
      },
      readyNext,
    );
    expect(readyRedirect).not.toHaveBeenCalled();
    expect(readyNext).toHaveBeenCalledTimes(1);

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

  it("returns degraded readiness when dependencies fail without leaking internals", async () => {
    refs.redis.ping.mockRejectedValueOnce(new Error("redis auth token mismatch"));

    const { createHttpApp } = await import("../../../server/http/app.factory.js");
    const environment: Environment = LoggerEnvironment.Production;

    createHttpApp({
      isDev: false,
      isProd: true,
      allowedOrigins: ["https://allowed.example.com"],
      environment,
      trustProxy: true,
      apiBasePath: "",
    });

    const readyCall = refs.appRef.current.get.mock.calls.find(
      ([path]) => path === "/ready",
    );
    const readyHandler = readyCall?.[1];
    assertFunction<(req: unknown, res: HealthResponse) => Promise<void>>(
      readyHandler,
      "readyHandler",
    );

    const readyJson = vi.fn();
    const readyStatus = vi.fn(() => ({ json: readyJson }));
    await readyHandler({}, { status: readyStatus });

    expect(readyStatus).toHaveBeenCalledWith(503);
    const payload = readyJson.mock.calls[0]?.[0] as {
      status: string;
      checks: {
        redis: {
          ok: boolean;
          detail?: string;
        };
      };
    };
    expect(payload.status).toBe("degraded");
    expect(payload.checks.redis.ok).toBe(false);
    expect(payload.checks.redis.detail).toBe("unavailable");
    expect(payload.checks.redis.detail).not.toContain("auth");
  });
});
