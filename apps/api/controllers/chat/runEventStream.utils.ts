import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { streamRunEventsFromPersistence as streamRunEventsFromPersistenceInternal } from "../../services/runEventStream.utils/service.js";

interface StreamRunEventsOptions {
  req: AuthenticatedRequest;
  res: Response;
  runId: string;
  explicitLastEventId?: string;
}

export async function streamRunEventsFromPersistence({
  req,
  res,
  runId,
  explicitLastEventId,
}: StreamRunEventsOptions): Promise<void> {
  await streamRunEventsFromPersistenceInternal({
    req,
    res,
    runId,
    explicitLastEventId,
  });
}
