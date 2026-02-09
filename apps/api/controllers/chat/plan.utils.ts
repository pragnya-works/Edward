import type { Response } from "express";
import { reflectPlan } from "../../services/planning/analyzers/planAnalyzer.js";
import {
  appendPlanDecision,
  isPlanComplete,
  getIncompleteSteps,
  markRemainingStepsAsFailed,
  getPlanCompletionSummary,
} from "../../services/planning/workflow/plan.js";
import { saveWorkflow } from "../../services/planning/workflow/store.js";
import type { WorkflowState } from "../../services/planning/schemas.js";
import { ParserEventType } from "../../schemas/chat.schema.js";
import { emitPlanUpdate, safeSSEWrite } from "./sse.utils.js";
import { logger } from "../../utils/logger.js";

export interface PlanUpdateContext {
  workflow: WorkflowState;
  res: Response;
  decryptedApiKey: string;
  userId: string;
  chatId: string;
}

export async function updatePlanWithDecision(
  ctx: PlanUpdateContext,
  decisionContext: string,
): Promise<void> {
  if (!ctx.workflow.context.plan) return;

  try {
    const updated = await reflectPlan(
      ctx.workflow.context.plan,
      decisionContext,
      ctx.decryptedApiKey,
    );
    ctx.workflow.context.plan = appendPlanDecision(updated, decisionContext);
    await saveWorkflow(ctx.workflow);
    emitPlanUpdate(ctx.res, ctx.workflow.context.plan);
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    logger.error(
      { error: err, userId: ctx.userId, chatId: ctx.chatId },
      "Failed to reflect plan on decision point",
    );
  }
}

export async function finalizePlanBeforeCompletion(
  ctx: PlanUpdateContext,
  reason: string,
): Promise<void> {
  if (!ctx.workflow.context.plan) return;

  const completionSummary = getPlanCompletionSummary(ctx.workflow.context.plan);

  logger.info(
    {
      chatId: ctx.chatId,
      userId: ctx.userId,
      reason,
      summary: completionSummary,
      incompleteSteps: getIncompleteSteps(ctx.workflow.context.plan).map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
      })),
    },
    "Finalizing plan before completion",
  );

  if (!isPlanComplete(ctx.workflow.context.plan)) {
    const incompleteSteps = getIncompleteSteps(ctx.workflow.context.plan);
    logger.warn(
      {
        chatId: ctx.chatId,
        userId: ctx.userId,
        reason,
        incompleteCount: incompleteSteps.length,
        incompleteSteps: incompleteSteps.map((s) => s.title),
      },
      "Stream ending with incomplete plan steps",
    );

    ctx.workflow.context.plan = markRemainingStepsAsFailed(
      ctx.workflow.context.plan,
      reason,
    );
    await saveWorkflow(ctx.workflow);
    emitPlanUpdate(ctx.res, ctx.workflow.context.plan);

    if (!ctx.res.writableEnded) {
      safeSSEWrite(
        ctx.res,
        `data: ${JSON.stringify({
          type: ParserEventType.ERROR,
          message: `Warning: Stream completed but ${incompleteSteps.length} step(s) were not finished: ${incompleteSteps.map((s) => s.title).join(", ")}`,
        })}\n\n`,
      );
    }
  } else {
    logger.info(
      {
        chatId: ctx.chatId,
        userId: ctx.userId,
        reason,
        summary: completionSummary,
      },
      "Plan completed successfully",
    );
  }
}
