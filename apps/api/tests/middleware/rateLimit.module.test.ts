import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

type RateLimitOptions = {
  keyGenerator?: (req: { ip?: string; userId?: string }) => string;
  skip?: (req: { method: string }) => boolean;
  handler?: (req: unknown, res: unknown) => void;
  store?: { sendCommand: (...args: string[]) => Promise<unknown> };
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
};

type DailyChatRequest = Request & { userId?: string };

function isDailyChatRequest(value: unknown): value is DailyChatRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.originalUrl === "string" &&
    typeof candidate.ip === "string" &&
    (typeof candidate.userId === "string" || typeof candidate.userId === "undefined")
  );
}

function createDailyChatRequest(input: {
  originalUrl: string;
  ip: string;
  userId: string;
}): DailyChatRequest {
  const candidate: Record<string, unknown> = {
    originalUrl: input.originalUrl,
    ip: input.ip,
    userId: input.userId,
  };
  if (!isDailyChatRequest(candidate)) {
    throw new Error("Invalid daily chat request fixture");
  }
  return candidate;
}

function isDailyChatResponse(value: unknown): value is Response {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.setHeader === "function";
}

function createDailyChatResponse() {
  const setHeader = vi.fn();
  const candidate: Record<string, unknown> = { setHeader };
  if (!isDailyChatResponse(candidate)) {
    throw new Error("Invalid daily chat response fixture");
  }
  const response = candidate;
  return { response, setHeader };
}

const refs = vi.hoisted(() => ({
  options: [] as RateLimitOptions[],
  redisStoreConfigs: [] as Array<{
    sendCommand: (...args: string[]) => Promise<unknown>;
    prefix: string;
  }>,
  redisCall: vi.fn(async () => "OK"),
  ipKeyGenerator: vi.fn((ip: string) => `ip:${ip}`),
  sendError: vi.fn(),
  logSecurityEvent: vi.fn(),
  getClientIp: vi.fn(() => "127.0.0.1"),
  getRequestId: vi.fn(() => "req-1"),
}));

vi.mock("express-rate-limit", () => ({
  default: vi.fn((options: RateLimitOptions) => {
    refs.options.push(options);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  }),
  ipKeyGenerator: refs.ipKeyGenerator,
}));

vi.mock("rate-limit-redis", () => ({
  RedisStore: class RedisStore {
    constructor(config: {
      sendCommand: (...args: string[]) => Promise<unknown>;
      prefix: string;
    }) {
      refs.redisStoreConfigs.push(config);
    }
  },
}));

vi.mock("../../lib/redis.js", () => ({
  redis: {
    call: refs.redisCall,
  },
}));

vi.mock("../../utils/response.js", () => ({
  sendError: refs.sendError,
}));

vi.mock("../../middleware/securityTelemetry.js", () => ({
  getClientIp: refs.getClientIp,
  getRequestId: refs.getRequestId,
  logSecurityEvent: refs.logSecurityEvent,
}));

describe("rateLimit middleware module", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    refs.options.length = 0;
    refs.redisStoreConfigs.length = 0;
  });

  it("creates one limiter per declared scope with shared headers", async () => {
    await import("../../middleware/rateLimit.js");

    expect(refs.options).toHaveLength(6);
    for (const option of refs.options) {
      expect(option.standardHeaders).toBe(true);
      expect(option.legacyHeaders).toBe(false);
      expect(option.store).toBeDefined();
      expect(option.handler).toBeTypeOf("function");
    }
  });

  it("uses authenticated user id for API key scope and falls back to IP", async () => {
    await import("../../middleware/rateLimit.js");

    const apiKeyLimiterOptions = refs.options.find(
      (options) => typeof options.skip === "function",
    );
    const keyGenerator = apiKeyLimiterOptions?.keyGenerator;
    expect(keyGenerator).toBeTypeOf("function");

    const fromUser = keyGenerator?.({ userId: "user-42", ip: "10.0.0.1" });
    const fromIp = keyGenerator?.({ ip: "10.0.0.2" });

    expect(fromUser).toBe("user-42");
    expect(fromIp).toBe("ip:10.0.0.2");
    expect(refs.ipKeyGenerator).toHaveBeenCalledWith("10.0.0.2");

    const skip = apiKeyLimiterOptions?.skip;
    expect(skip?.({ method: "GET" })).toBe(true);
    expect(skip?.({ method: "HEAD" })).toBe(true);
    expect(skip?.({ method: "OPTIONS" })).toBe(true);
    expect(skip?.({ method: "POST" })).toBe(false);
  });

  it("logs and responds when rate-limit handler is triggered", async () => {
    await import("../../middleware/rateLimit.js");

    const apiKeyLimiterOptions = refs.options.find(
      (options) => typeof options.skip === "function",
    );
    const handler = apiKeyLimiterOptions?.handler;
    expect(handler).toBeTypeOf("function");

    const res = {
      setHeader: vi.fn(),
    };

    handler?.(
      {
        originalUrl: "/api-key",
        ip: "10.0.0.9",
        userId: "user-999",
      },
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Scope", expect.any(String));
    expect(refs.logSecurityEvent).toHaveBeenCalledWith(
      "rate_limit_exceeded",
      expect.objectContaining({
        path: "/api-key",
        ip: "127.0.0.1",
        requestId: "req-1",
        userId: "user-999",
      }),
    );
    expect(refs.sendError).toHaveBeenCalledWith(
      res,
      429,
      expect.any(String),
    );
  });

  it("builds redis command sender with prefix and validates command presence", async () => {
    await import("../../middleware/rateLimit.js");

    const config = refs.redisStoreConfigs[0];
    expect(config).toBeDefined();
    expect(config?.prefix.startsWith("rl:")).toBe(true);

    await expect(config?.sendCommand("PING", "one")).resolves.toBe("OK");
    expect(refs.redisCall).toHaveBeenCalledWith("PING", "one");

    await expect(config?.sendCommand("")).rejects.toThrow(
      "Redis command is missing",
    );
  });

  it("allows daily chat requests when successful-response quota is not exhausted", async () => {
    refs.redisCall.mockImplementation(async (...args: unknown[]) => {
      const command = String(args[0] ?? "");
      if (command === "GET") {
        return "3";
      }
      if (command === "PTTL") {
        return "60000";
      }
      return "OK";
    });

    const { dailyChatRateLimiter } = await import("../../middleware/rateLimit.js");

    const next = vi.fn();
    const req = createDailyChatRequest({
      originalUrl: "/chat/message",
      ip: "10.0.0.3",
      userId: "user-ok",
    });
    const { response: res, setHeader } = createDailyChatResponse();
    await dailyChatRateLimiter(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(refs.sendError).not.toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith("RateLimit-Limit", expect.any(String));
    expect(setHeader).toHaveBeenCalledWith("RateLimit-Remaining", expect.any(String));
    expect(setHeader).toHaveBeenCalledWith("RateLimit-Reset", expect.any(String));
    expect(setHeader).toHaveBeenCalledWith("RateLimit-Scope", expect.any(String));
  });

  it("blocks daily chat requests when successful-response quota is exhausted", async () => {
    refs.redisCall.mockImplementation(async (...args: unknown[]) => {
      const command = String(args[0] ?? "");
      if (command === "GET") {
        return "10";
      }
      if (command === "PTTL") {
        return "30000";
      }
      return "OK";
    });

    const { dailyChatRateLimiter } = await import("../../middleware/rateLimit.js");

    const next = vi.fn();
    const req = createDailyChatRequest({
      originalUrl: "/chat/message",
      ip: "10.0.0.9",
      userId: "user-blocked",
    });
    const { response: res } = createDailyChatResponse();
    await dailyChatRateLimiter(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(refs.sendError).toHaveBeenCalledWith(res, 429, expect.any(String));
    expect(refs.logSecurityEvent).toHaveBeenCalledWith(
      "rate_limit_exceeded",
      expect.objectContaining({
        path: "/chat/message",
        ip: "127.0.0.1",
        requestId: "req-1",
        userId: "user-blocked",
      }),
    );
  });
});
