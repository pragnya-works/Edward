import {
  createRunWithUserLimit,
  count,
  db,
  inArray,
  run as runTable,
  updateRun,
} from "@edward/auth";
import { enqueueAgentRunJob } from "../queue/enqueue.js";
import {
  MAX_ACTIVE_RUNS_PER_USER,
  MAX_AGENT_QUEUE_DEPTH,
} from "../../utils/constants.js";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";

export interface RunAdmissionWindow {
  activeRunDepth: number;
  dynamicUserRunLimit: number;
  overloaded: boolean;
}

export async function getRunAdmissionWindow(): Promise<RunAdmissionWindow> {
  const [activeRunCountResult] = await db
    .select({ value: count() })
    .from(runTable)
    .where(inArray(runTable.status, ["queued", "running"]));
  const activeRunDepth = Number(activeRunCountResult?.value ?? 0);
  const dynamicUserRunLimit =
    activeRunDepth >= Math.floor(MAX_AGENT_QUEUE_DEPTH * 0.8)
      ? 1
      : MAX_ACTIVE_RUNS_PER_USER;

  return {
    activeRunDepth,
    dynamicUserRunLimit,
    overloaded: activeRunDepth >= MAX_AGENT_QUEUE_DEPTH,
  };
}

export async function createAdmittedRun(params: {
  chatId: string;
  userId: string;
  userMessageId: string;
  assistantMessageId: string;
  metadata: Record<string, unknown>;
  userRunLimit: number;
}) {
  const {
    chatId,
    userId,
    userMessageId,
    assistantMessageId,
    metadata,
    userRunLimit,
  } = params;

  return createRunWithUserLimit(
    {
      chatId,
      userId,
      userMessageId,
      assistantMessageId,
      metadata,
    },
    userRunLimit,
  );
}

export async function enqueueAdmittedRun(runId: string): Promise<{
  queued: boolean;
  errorMessage?: string;
}> {
  try {
    await enqueueAgentRunJob({ runId });
    return { queued: true };
  } catch (enqueueError) {
    const errorMessage = ensureError(enqueueError).message;
    await updateRun(runId, {
      status: "failed",
      state: "FAILED",
      errorMessage,
      completedAt: new Date(),
    }).catch(() => {});
    logger.error(
      { runId, errorMessage },
      "Failed to enqueue admitted run; marked as failed",
    );
    return { queued: false, errorMessage };
  }
}
