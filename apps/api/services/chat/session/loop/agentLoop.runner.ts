import {
  AgentLoopStopReason,
  MetaPhase,
} from "@edward/shared/streamEvents";
import {
  PromptProfile,
  type PromptProfile as PromptProfileType,
} from "../../../../lib/llm/prompts/sections.js";
import {
  computeTokenUsage,
  isOverContextLimit,
} from "../../../../lib/llm/tokens.js";
import {
  MAX_AGENT_TURNS,
} from "../../../../utils/constants.js";
import type { LlmChatMessage } from "../../../../lib/llm/context.js";
import type { MessageContent } from "@edward/shared/llm/types";
import type {
  ChatAction,
  Framework,
} from "../../../../services/planning/schemas.js";
import type {
  WebSearchToolResult,
} from "@edward/shared/streamToolResults";
import {
  sendSSEError,
} from "../../../../services/sse-utils/service.js";
import {
  emitTurnCompleteMeta,
  type EventHandlerContextParams,
  type EmitMeta,
} from "../shared/meta.js";
import type {
  AgentLoopCheckpoint,
  AgentLoopCheckpointWriter,
} from "../shared/checkpoint.types.js";
import { executeAgentTurnStream } from "./agentLoop.stream.js";
import { resolveTurnOutcome } from "./agentLoop.turnOutcome.js";

const SANDBOX_TAG_PATTERN = /<edward_sandbox\b/i;
const FILE_TAG_PATTERN = /<file\b/i;

export function hasCodeOutputInTurn(rawTurnResponse: string): boolean {
  return (
    SANDBOX_TAG_PATTERN.test(rawTurnResponse) ||
    FILE_TAG_PATTERN.test(rawTurnResponse)
  );
}

export interface RunAgentLoopParams {
  decryptedApiKey: string;
  initialMessages: LlmChatMessage[];
  preVerifiedDeps: string[];
  systemPrompt: string;
  framework: Framework | undefined;
  complexity: "simple" | "moderate" | "complex";
  mode: ChatAction;
  promptProfile?: PromptProfileType;
  model: string | undefined;
  abortController: AbortController;
  userContent: MessageContent;
  workflow: EventHandlerContextParams["workflow"];
  res: EventHandlerContextParams["res"];
  chatId: string;
  isFollowUp: boolean;
  generatedFiles: Map<string, string>;
  declaredPackages: string[];
  emitMeta: EmitMeta;
  runId: string;
  resumeCheckpoint?: AgentLoopCheckpoint;
  onCheckpoint?: AgentLoopCheckpointWriter;
  installTaskQueue?: {
    enqueue(task: () => Promise<void>): void;
    waitForIdle(): Promise<void>;
  };
}

export interface RunAgentLoopResult {
  fullRawResponse: string;
  agentTurn: number;
  loopStopReason: AgentLoopStopReason;
  webSearchResults: WebSearchToolResult[];
  aborted: boolean;
  outputTokens?: number;
}

export async function runAgentLoop(
  params: RunAgentLoopParams,
): Promise<RunAgentLoopResult> {
  const {
    decryptedApiKey,
    initialMessages,
    preVerifiedDeps,
    systemPrompt,
    framework,
    complexity,
    mode,
    promptProfile = PromptProfile.COMPACT,
    model,
    abortController,
    userContent,
    workflow,
    res,
    chatId,
    isFollowUp,
    generatedFiles,
    declaredPackages,
    emitMeta,
    runId,
    resumeCheckpoint,
    onCheckpoint,
    installTaskQueue: providedInstallTaskQueue,
  } = params;

  let installQueueTail = Promise.resolve();
  const installTaskQueue =
    providedInstallTaskQueue ??
    {
      enqueue(task: () => Promise<void>) {
        const queuedTask = installQueueTail.then(task, task);
        installQueueTail = queuedTask.catch(() => undefined);
      },
      async waitForIdle() {
        await installQueueTail;
      },
    };

  let fullRawResponse = resumeCheckpoint?.fullRawResponse ?? "";
  let agentMessages: LlmChatMessage[] =
    resumeCheckpoint?.agentMessages ?? initialMessages;
  let agentTurn = resumeCheckpoint?.turn ?? 0;
  let totalToolCallsInRun = resumeCheckpoint?.totalToolCallsInRun ?? 0;
  let sandboxTagDetected = resumeCheckpoint?.sandboxTagDetected ?? false;
  let canTrackExactOutputTokens =
    typeof resumeCheckpoint?.outputTokens === "number" ||
    fullRawResponse.length === 0;
  const webSearchResults: WebSearchToolResult[] = [];
  let loopStopReason: AgentLoopStopReason = AgentLoopStopReason.NO_TOOL_RESULTS;
  let noProgressContinuations = 0;
  let outputTokens = resumeCheckpoint?.outputTokens;

  agentLoop: while (agentTurn < MAX_AGENT_TURNS) {
    agentTurn += 1;

    const turnTokenUsage = await computeTokenUsage({
      apiKey: decryptedApiKey,
      systemPrompt,
      messages: agentMessages,
      model,
    });

    emitMeta({
      turn: agentTurn,
      phase: MetaPhase.TURN_START,
      tokenUsage: turnTokenUsage,
    });

    if (isOverContextLimit(turnTokenUsage)) {
      loopStopReason = AgentLoopStopReason.CONTEXT_LIMIT_EXCEEDED;
      sendSSEError(
        res,
        `Turn context too large for model window. Input tokens=${turnTokenUsage.totalContextTokens}, reservedOutputTokens=${turnTokenUsage.reservedOutputTokens}, contextWindowTokens=${turnTokenUsage.contextWindowTokens}.`,
        {
          code: "context_limit_exceeded",
          details: {
            turn: agentTurn,
            inputTokens: turnTokenUsage.totalContextTokens,
            reservedOutputTokens: turnTokenUsage.reservedOutputTokens,
            contextWindowTokens: turnTokenUsage.contextWindowTokens,
          },
        },
      );
      emitTurnCompleteMeta(emitMeta, agentTurn, 0);
      break;
    }

    const {
      fullRawResponse: streamedRawResponse,
      turnRawResponse,
      responseSizeExceededThisTurn,
      toolResultsThisTurn,
      budgetState,
      turnState,
      outputTokensThisTurn,
    } = await executeAgentTurnStream({
      decryptedApiKey,
      agentMessages,
      preVerifiedDeps,
      systemPrompt,
      framework,
      complexity,
      mode,
      promptProfile,
      model,
      abortController,
      workflow,
      res,
      chatId,
      isFollowUp,
      generatedFiles,
      declaredPackages,
      runId,
      turn: agentTurn,
      installTaskQueue,
      fullRawResponse,
      sandboxTagDetected,
      totalToolCallsInRun,
    });
    fullRawResponse = streamedRawResponse;
    if (canTrackExactOutputTokens) {
      if (typeof outputTokensThisTurn === "number") {
        outputTokens = (outputTokens ?? 0) + outputTokensThisTurn;
      } else if (turnRawResponse.length > 0) {
        canTrackExactOutputTokens = false;
        outputTokens = undefined;
      }
    }

    if (abortController.signal.aborted) {
      return {
        fullRawResponse,
        agentTurn,
        loopStopReason,
        webSearchResults,
        aborted: true,
        outputTokens,
      };
    }

    sandboxTagDetected = turnState.sandboxTagDetected;
    totalToolCallsInRun = turnState.totalToolCallsInRun;
    webSearchResults.push(
      ...toolResultsThisTurn.filter(
        (result): result is WebSearchToolResult => result.tool === "web_search",
      ),
    );

    const turnOutcome = await resolveTurnOutcome({
      agentTurn,
      turnRawResponse,
      userContent,
      res,
      emitMeta,
      budgetState,
      turnState,
      responseSizeExceededThisTurn,
      toolResultsThisTurn,
      totalToolCallsInRun,
      fullRawResponse,
      sandboxTagDetected,
      chatId,
      runId,
      onCheckpoint,
      agentMessages,
      abortSignal: abortController.signal,
      noProgressContinuations,
      outputTokens,
    });
    agentMessages = turnOutcome.agentMessages;
    noProgressContinuations = turnOutcome.noProgressContinuations;

    if (turnOutcome.action === "continue") {
      continue agentLoop;
    }

    loopStopReason = turnOutcome.loopStopReason;
    break;
  }

  if (
    agentTurn >= MAX_AGENT_TURNS &&
    loopStopReason === AgentLoopStopReason.NO_TOOL_RESULTS
  ) {
    loopStopReason = AgentLoopStopReason.MAX_TURNS_REACHED;
  }

  return {
    fullRawResponse,
    agentTurn,
    loopStopReason,
    webSearchResults,
    aborted: false,
    outputTokens,
  };
}
