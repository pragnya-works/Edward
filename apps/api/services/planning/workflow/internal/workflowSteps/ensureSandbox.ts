import { nanoid } from "nanoid";
import { logger } from "../../../../../utils/logger.js";
import type { Framework, WorkflowState } from "../../../schemas.js";
import {
  provisionSandbox,
  getActiveSandbox,
} from "../../../../sandbox/lifecycle/provisioning.js";
import { getChatFramework } from "../../../../sandbox/state.service.js";
import { hasBackup, hasBackupOnS3 } from "../../../../sandbox/backup.service.js";
import { saveWorkflow } from "../../store.js";

export async function ensureSandbox(
  state: WorkflowState,
  framework?: Framework,
  shouldRestore: boolean = false,
): Promise<string> {
  const callId = nanoid(8);
  logger.info(
    { workflowId: state.id, chatId: state.chatId, callId },
    "ensureSandbox called",
  );

  let sandboxId = await getActiveSandbox(state.chatId);

  if (sandboxId) {
    logger.info(
      { workflowId: state.id, sandboxId, callId },
      "ensureSandbox: Reused existing sandbox",
    );
    state.sandboxId = sandboxId;
    await saveWorkflow(state);
    return sandboxId;
  }

  let effectiveFramework = framework || state.context.framework;
  if (!effectiveFramework) {
    const cachedFramework = await getChatFramework(state.chatId);
    if (cachedFramework) {
      effectiveFramework = cachedFramework as Framework;
      logger.info(
        { chatId: state.chatId, framework: effectiveFramework },
        "Recovered framework from Redis cache for sandbox provisioning",
      );
    }
  }

  let effectiveRestore = false;
  if (shouldRestore) {
    effectiveRestore = await hasBackup(state.chatId);
    if (!effectiveRestore) {
      effectiveRestore = await hasBackupOnS3(state.chatId, state.userId);
      if (effectiveRestore) {
        logger.info(
          { chatId: state.chatId },
          "Backup flag missing in Redis but found on S3, restoring",
        );
      } else {
        logger.debug(
          { chatId: state.chatId },
          "shouldRestore requested but no backup exists, skipping restore",
        );
      }
    }
  }

  sandboxId = await provisionSandbox(
    state.userId,
    state.chatId,
    effectiveFramework,
    effectiveRestore,
  );

  logger.info(
    {
      workflowId: state.id,
      sandboxId,
      callId,
      framework: effectiveFramework,
      restored: effectiveRestore,
    },
    "ensureSandbox: New sandbox provisioned",
  );
  state.sandboxId = sandboxId;
  await saveWorkflow(state);
  return sandboxId;
}
