import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";

interface RequestWithTelemetry extends Request {
  requestId?: string;
}

export function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
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
