import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";

interface RequestWithTelemetry extends Request {
  requestId?: string;
}

function isProxyTrusted(req: Request): boolean {
  const trustProxy = req.app?.get?.("trust proxy");
  if (trustProxy === undefined || trustProxy === null) {
    return false;
  }
  if (typeof trustProxy === "boolean") {
    return trustProxy;
  }
  if (typeof trustProxy === "number") {
    return trustProxy > 0;
  }
  if (typeof trustProxy === "string") {
    return trustProxy.trim().toLowerCase() !== "false";
  }
  if (typeof trustProxy === "function") {
    return true;
  }
  return false;
}

export function getClientIp(req: Request): string {
  if (!isProxyTrusted(req)) {
    return req.ip || "unknown";
  }

  const forwardedFor =
    typeof req.header === "function"
      ? req.header("x-forwarded-for")
      : typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"]
        : Array.isArray(req.headers["x-forwarded-for"])
          ? req.headers["x-forwarded-for"][0]
          : undefined;
  const forwardedIp = forwardedFor
    ?.split(",")
    .map((value) => value.trim())
    .find(Boolean);

  return forwardedIp || req.ip || "unknown";
}

export function getOrCreateRequestId(req: Request, res: Response): string {
  const incoming = req.header("x-request-id")?.trim();
  const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
  (req as RequestWithTelemetry).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  return requestId;
}

export function getRequestId(req: Request): string | undefined {
  const fromMiddleware = (req as RequestWithTelemetry).requestId;
  if (fromMiddleware) {
    return fromMiddleware;
  }

  const incoming = (
    typeof req.header === "function"
      ? req.header("x-request-id")
      : typeof req.headers["x-request-id"] === "string"
        ? req.headers["x-request-id"]
        : Array.isArray(req.headers["x-request-id"])
          ? req.headers["x-request-id"][0]
          : undefined
  )?.trim();
  return incoming && incoming.length > 0 ? incoming : undefined;
}

export function logSecurityEvent(
  event: string,
  data: Record<string, unknown>,
): void {
  logger.warn({ event, ...data }, "Security telemetry event");
}

export function securityTelemetryMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = Date.now();
  const requestId = getOrCreateRequestId(req, res);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const status = res.statusCode;

    if (status === 401 || status === 403 || status === 429 || status >= 500) {
      logSecurityEvent("http_anomaly", {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status,
        durationMs,
        ip: getClientIp(req),
      });
    }
  });

  next();
}
