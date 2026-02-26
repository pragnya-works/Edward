import type { Response } from "express";
import { ParserEventType } from "@edward/shared/streamEvents";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import { createBuild, updateBuild } from "@edward/auth";
import { enqueueBuildJob } from "../../../../services/queue/enqueue.js";
import { flushSandbox } from "../../../../services/sandbox/write/flush.js";
import {
  validateGeneratedOutput,
} from "../../../../services/planning/validators/postgenValidator.js";
import type { ChatAction } from "../../../../services/planning/schemas.js";
import { redis } from "../../../../lib/redis.js";
import { ensureError } from "../../../../utils/error.js";
import { logger } from "../../../../utils/logger.js";
import {
  sendSSEEvent,
  sendSSERecoverableError,
} from "../../sse.utils.js";
import { buildPostgenValidationErrorReport } from "./postgenValidationReport.js";
import { applyDeterministicPostgenAutofixes } from "./postgenAutofix.js";

interface ProcessBuildPipelineParams {
  sandboxId: string;
  chatId: string;
  userId: string;
  assistantMessageId: string;
  runId: string;
  res: Response;
  framework: string | undefined;
  mode: ChatAction;
  generatedFiles: Map<string, string>;
  declaredPackages: string[];
}

export async function processBuildPipeline(
  params: ProcessBuildPipelineParams,
): Promise<void> {
  const {
    sandboxId,
    chatId,
    userId,
    assistantMessageId,
    runId,
    res,
    framework,
    mode,
    generatedFiles,
    declaredPackages,
  } = params;

  let blockingValidationReport: Record<string, unknown> | null = null;

  await applyDeterministicPostgenAutofixes({
    framework,
    mode,
    generatedFiles,
    sandboxId,
    chatId,
    runId,
  });

  if (generatedFiles.size > 0) {
    const validation = validateGeneratedOutput({
      framework,
      files: generatedFiles,
      declaredPackages,
      mode,
    });

    if (!validation.valid) {
      const errorViolations = validation.violations.filter(
        (v) => v.severity === "error",
      );
      logger.warn(
        { violations: errorViolations, chatId },
        "Post-gen validation found build-breaking issues",
      );
      for (const violation of validation.violations) {
        sendSSERecoverableError(res, `[Validation] ${violation.message}`, {
          code: "postgen_validation",
        });
      }

      if (errorViolations.length > 0) {
        blockingValidationReport = buildPostgenValidationErrorReport(
          validation.violations,
        );
      }
    }
  }

  await flushSandbox(sandboxId, true).catch((err: unknown) =>
    logger.error(
      ensureError(err),
      `Final flush failed for sandbox: ${sandboxId}`,
    ),
  );

  if (blockingValidationReport) {
    const failedBuild = await createBuild({
      chatId,
      messageId: assistantMessageId,
      status: BuildRecordStatus.FAILED,
    });

    await updateBuild(failedBuild.id, {
      status: BuildRecordStatus.FAILED,
      errorReport: blockingValidationReport,
    }).catch(() => { });

    const buildStatusChannel = `edward:build-status:${chatId}`;
    try {
      await redis.publish(
        buildStatusChannel,
        JSON.stringify({
          buildId: failedBuild.id,
          runId,
          status: BuildRecordStatus.FAILED,
          errorReport: blockingValidationReport,
        }),
      );
    } catch (publishErr) {
      logger.warn(
        {
          err: ensureError(publishErr),
          chatId,
          runId,
          buildId: failedBuild.id,
        },
        "Failed to publish build status update",
      );
    }

    sendSSEEvent(res, {
      type: ParserEventType.BUILD_STATUS,
      chatId,
      status: BuildRecordStatus.FAILED,
      buildId: failedBuild.id,
      runId,
      errorReport: blockingValidationReport,
    });
    return;
  }

  const queuedBuild = await createBuild({
    chatId,
    messageId: assistantMessageId,
    status: BuildRecordStatus.QUEUED,
  });

  const buildStatusChannel = `edward:build-status:${chatId}`;
  const publishBuildStatus = async (payload: Record<string, unknown>) => {
    try {
      await redis.publish(
        buildStatusChannel,
        JSON.stringify(payload),
      );
    } catch (publishErr) {
      logger.warn(
        {
          err: ensureError(publishErr),
          chatId,
          runId,
          buildId: queuedBuild.id,
        },
        "Failed to publish build status update",
      );
    }
  };

  await publishBuildStatus({
    buildId: queuedBuild.id,
    runId,
    status: BuildRecordStatus.QUEUED,
  });

  try {
    await enqueueBuildJob({
      sandboxId,
      userId,
      chatId,
      messageId: assistantMessageId,
      buildId: queuedBuild.id,
      runId,
    });
  } catch (queueErr) {
    const enqueueErrorReport = {
      failed: true,
      headline: "Failed to enqueue build job",
      details: queueErr instanceof Error ? queueErr.message : String(queueErr),
    };

    await updateBuild(queuedBuild.id, {
      status: BuildRecordStatus.FAILED,
      errorReport: enqueueErrorReport as Record<string, unknown>,
    } as Parameters<typeof updateBuild>[1]).catch(() => { });

    await publishBuildStatus({
      buildId: queuedBuild.id,
      runId,
      status: BuildRecordStatus.FAILED,
      errorReport: enqueueErrorReport,
    });

    sendSSEEvent(res, {
      type: ParserEventType.BUILD_STATUS,
      chatId,
      status: BuildRecordStatus.FAILED,
      buildId: queuedBuild.id,
      runId,
      errorReport: enqueueErrorReport,
    });

    logger.error(
      {
        err: ensureError(queueErr),
        chatId,
        runId,
        sandboxId,
      },
      "Failed to enqueue build job",
    );
  }
}
