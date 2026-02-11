import {
  getContainer,
  execCommand,
  CONTAINER_WORKDIR,
} from "../sandbox/docker.sandbox.js";
import { logger } from "../../utils/logger.js";
import { extractDiagnostics } from "../diagnostics/diagnostics.js";
import {
  runDeterministicFixes,
  filterAutoFixable,
} from "./deterministic/index.js";
import {
  compareDiagnostics,
  shouldContinueFixing,
} from "./diagnosticComparison.js";
import { buildFixPrompt, extractFileFromResponse } from "./fixPrompt.js";
import {
  prepareSandboxFile,
  writeSandboxFile,
  flushSandbox,
} from "../sandbox/writes.sandbox.js";
import { readSpecificFiles } from "../sandbox/read.sandbox.js";
import { generateResponse } from "../../lib/llm/response.js";
import type {
  AutofixOptions,
  AutofixResult,
  AutofixAttempt,
} from "./autofix.schemas.js";
import { DEFAULT_MAX_ATTEMPTS, BUILD_TIMEOUT_MS } from "./autofix.schemas.js";

export async function runAutoFix(
  options: AutofixOptions,
): Promise<AutofixResult> {
  const { sandboxId, containerId, apiKey, framework } = options;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const startTime = Date.now();

  logger.info(
    { sandboxId, maxAttempts, framework },
    "Starting autofix pipeline",
  );

  const initialBuildOutput = await runBuild(containerId, sandboxId);
  const initialExtraction = extractDiagnostics({
    framework,
    errorLog: initialBuildOutput.stderr,
    stdout: initialBuildOutput.stdout,
  });

  if (!initialExtraction.hasErrors) {
    return {
      success: true,
      attempts: [],
      initialDiagnostics: [],
      finalDiagnostics: [],
      deterministicActions: [],
      totalDuration: Date.now() - startTime,
    };
  }

  const deterministicResult = await runDeterministicFixes(
    sandboxId,
    initialExtraction.diagnostics,
    framework,
  );

  if (deterministicResult.remainingDiagnostics.length === 0) {
    const rebuildOutput = await runBuild(containerId, sandboxId);
    const rebuildExtraction = extractDiagnostics({
      framework,
      errorLog: rebuildOutput.stderr,
      stdout: rebuildOutput.stdout,
    });

    return {
      success: !rebuildExtraction.hasErrors,
      attempts: [],
      initialDiagnostics: initialExtraction.diagnostics,
      finalDiagnostics: rebuildExtraction.diagnostics,
      deterministicActions: deterministicResult.actions,
      totalDuration: Date.now() - startTime,
    };
  }

  let currentDiagnostics = deterministicResult.remainingDiagnostics;
  const fixable = filterAutoFixable(currentDiagnostics);
  const attempts: AutofixAttempt[] = [];

  logger.info(
    {
      sandboxId,
      deterministicFixed: deterministicResult.fixedDiagnostics.length,
      remaining: fixable.length,
    },
    "Deterministic phase complete, starting iterative fix phase",
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info(
      {
        sandboxId,
        attempt,
        maxAttempts,
        diagnosticCount: currentDiagnostics.length,
      },
      "Starting fix attempt",
    );

    const rebuildOutput = await runBuild(containerId, sandboxId);
    const rebuildExtraction = extractDiagnostics({
      framework,
      errorLog: rebuildOutput.stderr,
      stdout: rebuildOutput.stdout,
    });

    const comparison = compareDiagnostics(
      currentDiagnostics,
      rebuildExtraction.diagnostics,
    );

    const attemptResult: AutofixAttempt = {
      attempt,
      diagnosticsBefore: comparison.previousCount,
      diagnosticsAfter: comparison.currentCount,
      fixedCount: comparison.fixedIds.length,
      newCount: comparison.newIds.length,
      buildSuccess: !rebuildExtraction.hasErrors,
      actions: [],
    };

    attempts.push(attemptResult);

    if (!rebuildExtraction.hasErrors) {
      logger.info({ sandboxId, attempt }, "Build succeeded after autofix");
      return {
        success: true,
        attempts,
        initialDiagnostics: initialExtraction.diagnostics,
        finalDiagnostics: [],
        deterministicActions: deterministicResult.actions,
        totalDuration: Date.now() - startTime,
      };
    }

    if (!shouldContinueFixing(comparison, attempt, maxAttempts)) {
      logger.warn(
        {
          sandboxId,
          attempt,
          progress: comparison.progress,
          isRegression: comparison.isRegression,
        },
        "Stopping autofix: no progress or regression detected",
      );
      break;
    }

    const fixableDiagnostics = filterAutoFixable(rebuildExtraction.diagnostics);
    if (fixableDiagnostics.length === 0) {
      logger.info({ sandboxId, attempt }, "No fixable diagnostics remaining");
      break;
    }

    try {
      const relatedFiles = new Set<string>();
      for (const d of fixableDiagnostics) {
        if (d.file) relatedFiles.add(d.file);
      }
      const fileContents = await readSpecificFiles(
        sandboxId,
        Array.from(relatedFiles),
      );
      const prompt = buildFixPrompt({
        diagnostics: fixableDiagnostics,
        fileContents,
        framework,
      });

      if (!apiKey) {
        logger.error({ sandboxId }, "No API key provided, cannot apply fixes");
        break;
      }

      const llmResponse = await generateResponse(apiKey, prompt);
      const fixedFiles = extractFileFromResponse(llmResponse);

      if (fixedFiles.size === 0) {
        logger.warn({ sandboxId, attempt }, "LLM returned no fixable files");
        attemptResult.actions.push("llm_no_files_returned");
      } else {
        for (const [filePath, content] of fixedFiles) {
          await prepareSandboxFile(sandboxId, filePath);
          await writeSandboxFile(sandboxId, filePath, content);
          attemptResult.actions.push(`fixed:${filePath}`);
          logger.info({ sandboxId, attempt, filePath }, "Applied LLM fix");
        }
        await flushSandbox(sandboxId, true);
      }
    } catch (error) {
      logger.error({ error, sandboxId, attempt }, "Failed to apply LLM fixes");
      attemptResult.actions.push(
        `llm_error:${error instanceof Error ? error.message : String(error)}`,
      );
    }

    currentDiagnostics = rebuildExtraction.diagnostics;
  }

  return {
    success: false,
    attempts,
    initialDiagnostics: initialExtraction.diagnostics,
    finalDiagnostics: currentDiagnostics,
    deterministicActions: deterministicResult.actions,
    totalDuration: Date.now() - startTime,
  };
}

async function runBuild(
  containerId: string,
  sandboxId: string,
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  const container = getContainer(containerId);

  try {
    const result = await execCommand(
      container,
      ["pnpm", "run", "build"],
      false,
      BUILD_TIMEOUT_MS,
      undefined,
      CONTAINER_WORKDIR,
      ["NEXT_TELEMETRY_DISABLED=1", "CI=true"],
    );

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      success: result.exitCode === 0,
    };
  } catch (error) {
    logger.error({ error, sandboxId }, "Build execution failed");
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
}
