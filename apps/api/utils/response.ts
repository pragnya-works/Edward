import { Response } from "express";
import { HttpStatus } from "./constants.js";

export function sendError(
  res: Response,
  status: HttpStatus,
  error: string,
): void {
  res.status(status).json({
    error,
    timestamp: new Date().toISOString(),
  });
}

export function sendSuccess<T, M = unknown>(
  res: Response,
  status: HttpStatus,
  message: string,
  data?: T,
  metadata?: M,
): void {
  const response: Record<string, unknown> = {
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  if (metadata) {
    response.metadata = metadata;
  }
  res.status(status).json(response);
}
