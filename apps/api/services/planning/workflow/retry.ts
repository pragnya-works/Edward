import type { StepResult, WorkflowStepType } from "../schemas.js";
import { logger } from "../../../utils/logger.js";

export async function withRetry(
  fn: () => Promise<StepResult>,
  maxRetries: number,
  initialStep: WorkflowStepType,
): Promise<StepResult> {
  let result: StepResult = {
    step: initialStep,
    success: false,
    error: "No attempts made",
    durationMs: 0,
    retryCount: 0,
  };
  let retryCount = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    result = await fn();
    result.retryCount = retryCount;

    if (result.success) {
      logger.debug({ step: result.step, attempt }, "withRetry: Step succeeded");
      return result;
    }

    retryCount++;
    logger.warn(
      { step: result.step, attempt, maxRetries, error: result.error },
      "withRetry: Step failed, will retry",
    );

    if (attempt < maxRetries) {
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  logger.error(
    { step: result.step, totalRetries: retryCount, error: result.error },
    "withRetry: All retries exhausted",
  );
  return result;
}
