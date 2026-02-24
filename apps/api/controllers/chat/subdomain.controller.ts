import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import {
  checkSubdomainAvailability as checkSubdomainAvailabilityInternal,
  updateChatSubdomain as updateChatSubdomainInternal,
} from "../../services/previewRouting/subdomainUpdate.service.js";

export async function checkSubdomainAvailabilityHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  await checkSubdomainAvailabilityInternal(req, res);
}

export async function updateChatSubdomainHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  await updateChatSubdomainInternal(req, res);
}
