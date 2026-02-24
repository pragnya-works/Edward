import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { unifiedSendMessage as unifiedSendMessageInternal } from "../../services/runs/messageOrchestrator.service.js";

export async function unifiedSendMessage(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  await unifiedSendMessageInternal(req, res);
}
