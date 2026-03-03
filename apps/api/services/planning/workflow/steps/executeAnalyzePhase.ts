import type { IntentAnalysis, StepResult, WorkflowState } from "../../schemas.js";
import { WorkflowStep } from "../../schemas.js";
import { analyzeIntent } from "../../analyzers/intentAnalyzer.js";
import { getDecryptedApiKey } from "../../../apiKey.service.js";

export async function executeAnalyzePhase(
  state: WorkflowState,
  userRequest: string,
): Promise<StepResult> {
  const startTime = Date.now();

  try {
    const apiKey = await getDecryptedApiKey(state.userId);
    const analysis = await analyzeIntent(userRequest, apiKey);
    state.context.intent = analysis as IntentAnalysis;
    state.context.framework = (analysis as IntentAnalysis).suggestedFramework;

    return {
      step: WorkflowStep.ANALYZE,
      success: true,
      data: analysis,
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  } catch (error) {
    return {
      step: WorkflowStep.ANALYZE,
      success: false,
      error: error instanceof Error ? error.message : "Analysis failed",
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  }
}
