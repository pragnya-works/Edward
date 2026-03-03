import type { Response } from "express";
import { MessageRole } from "@edward/auth";
import { composePrompt } from "../../../../lib/llm/compose.js";
import { PromptProfile } from "../../../../lib/llm/prompts/sections.js";
import {
  computeTokenUsage,
} from "../../../../lib/llm/tokens.js";
import type { TokenUsage } from "../../../../lib/llm/tokens/usage.types.js";
import {
  type WorkflowState,
  type ChatAction as ChatActionType,
  type Framework,
} from "../../../../services/planning/schemas.js";
import type { ValidationViolation } from "../../../../services/planning/validators/postgenValidator.types.js";
import { logger } from "../../../../utils/logger.js";
import type { LlmChatMessage } from "../../../../lib/llm/context.js";
import { runAgentLoop } from "../loop/agentLoop.runner.js";
import type { EmitMeta } from "../shared/meta.js";
import { buildPostgenRetryPrompt } from "./postgenRetryPrompt.js";
import type { LoopState } from "./runStreamSession.helpers.js";

const STRICT_RETRY_MIN_VIOLATIONS = 5;

interface StrictRetryParams {
  chatId: string;
  runId: string;
  workflow: WorkflowState;
  initialBlockingViolations: ValidationViolation[];
  abortController: AbortController;
  userTextContent: string;
  mode: ChatActionType;
  framework: Framework | undefined;
  complexity: "simple" | "moderate" | "complex";
  preVerifiedDeps: string[];
  decryptedApiKey: string;
  model: string | undefined;
  res: Response;
  isFollowUp: boolean;
  emitMeta: EmitMeta;
  generatedFiles: Map<string, string>;
  declaredPackages: string[];
  loopState: LoopState;
  tokenUsage: TokenUsage;
}

function mergeTokenUsage(
  currentTokenUsage: TokenUsage,
  strictTokenUsage: TokenUsage,
): TokenUsage {
  return {
    ...currentTokenUsage,
    inputTokens: currentTokenUsage.inputTokens + strictTokenUsage.inputTokens,
    totalContextTokens: Math.max(
      currentTokenUsage.totalContextTokens,
      strictTokenUsage.totalContextTokens,
    ),
    remainingInputTokens: Math.min(
      currentTokenUsage.remainingInputTokens,
      strictTokenUsage.remainingInputTokens,
    ),
  };
}

export async function maybeRunStrictPostgenRetry({
  chatId,
  runId,
  workflow,
  initialBlockingViolations,
  abortController,
  userTextContent,
  mode,
  framework,
  complexity,
  preVerifiedDeps,
  decryptedApiKey,
  model,
  res,
  isFollowUp,
  emitMeta,
  generatedFiles,
  declaredPackages,
  loopState,
  tokenUsage,
}: StrictRetryParams): Promise<{
  loopState: LoopState;
  tokenUsage: TokenUsage;
}> {
  if (!workflow.sandboxId || initialBlockingViolations.length === 0) {
    return { loopState, tokenUsage };
  }

  if (initialBlockingViolations.length < STRICT_RETRY_MIN_VIOLATIONS) {
    logger.info(
      {
        chatId,
        runId,
        violationCount: initialBlockingViolations.length,
        threshold: STRICT_RETRY_MIN_VIOLATIONS,
      },
      "Post-gen validation failed below strict-retry threshold; skipping strict fallback",
    );
    return { loopState, tokenUsage };
  }

  if (abortController.signal.aborted) {
    return { loopState, tokenUsage };
  }

  logger.warn(
    {
      chatId,
      runId,
      violationCount: initialBlockingViolations.length,
    },
    "Post-gen validation failed; retrying once with strict prompt profile",
  );

  const strictRetryPrompt = buildPostgenRetryPrompt({
    originalUserRequest: userTextContent,
    mode,
    violations: initialBlockingViolations,
  });

  const strictMessages: LlmChatMessage[] = [
    { role: MessageRole.User, content: strictRetryPrompt },
  ];

  const strictSystemPrompt = composePrompt({
    framework,
    complexity,
    verifiedDependencies: preVerifiedDeps,
    mode,
    profile: PromptProfile.STRICT,
    userRequest: userTextContent,
    intentType: workflow.context.intent?.type,
    intentFeatures: workflow.context.intent?.features,
  });

  const strictTokenUsage = await computeTokenUsage({
    apiKey: decryptedApiKey,
    systemPrompt: strictSystemPrompt,
    messages: strictMessages,
    model,
    userPrompt: strictRetryPrompt,
  });

  const mergedTokenUsage = mergeTokenUsage(tokenUsage, strictTokenUsage);

  const generatedFilesSnapshot = new Map(generatedFiles);
  const declaredPackagesSnapshot = [...declaredPackages];
  generatedFiles.clear();
  declaredPackages.length = 0;

  const strictLoopResult = await runAgentLoop({
    decryptedApiKey,
    initialMessages: strictMessages,
    preVerifiedDeps,
    systemPrompt: strictSystemPrompt,
    framework,
    complexity,
    mode,
    promptProfile: PromptProfile.STRICT,
    model,
    abortController,
    userContent: strictRetryPrompt,
    workflow,
    res,
    chatId,
    isFollowUp,
    generatedFiles,
    declaredPackages,
    emitMeta,
    runId,
  });

  if (!strictLoopResult.aborted && strictLoopResult.fullRawResponse.trim()) {
    return {
      loopState: {
        fullRawResponse: strictLoopResult.fullRawResponse,
        agentTurn: loopState.agentTurn + strictLoopResult.agentTurn,
        loopStopReason: strictLoopResult.loopStopReason,
        webSearchResults: strictLoopResult.webSearchResults,
      },
      tokenUsage: mergedTokenUsage,
    };
  }

  generatedFiles.clear();
  for (const [filePath, fileContent] of generatedFilesSnapshot.entries()) {
    generatedFiles.set(filePath, fileContent);
  }
  declaredPackages.length = 0;
  declaredPackages.push(...declaredPackagesSnapshot);

  return {
    loopState,
    tokenUsage: mergedTokenUsage,
  };
}
