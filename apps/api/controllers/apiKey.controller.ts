import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import {
  createApiKey as createApiKeyInternal,
  deleteApiKey as deleteApiKeyInternal,
  getApiKey as getApiKeyInternal,
  updateApiKey as updateApiKeyInternal,
} from "../services/apiKey/controller.service.js";

export async function getApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  await getApiKeyInternal(req, res, next);
}

export async function createApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  await createApiKeyInternal(req, res, next);
}

export async function updateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  await updateApiKeyInternal(req, res, next);
}

export async function deleteApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  await deleteApiKeyInternal(req, res, next);
}
