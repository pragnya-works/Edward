import {
  ChatAction,
  type ChatAction as ChatActionType,
} from "../../../../services/planning/schemas.js";
import type { ValidationViolation } from "../../../../services/planning/validators/postgenValidator.types.js";
import { MAX_EMITTED_FILE_LINES } from "../../../../lib/llm/prompts/sections.js";

interface BuildPostgenRetryPromptOptions {
  originalUserRequest: string;
  mode: ChatActionType;
  violations: ValidationViolation[];
}

function formatViolation(violation: ValidationViolation, index: number): string {
  const file = violation.file ? ` (${violation.file})` : "";
  return `${index + 1}. ${violation.message}${file}`;
}

export function buildPostgenRetryPrompt(
  options: BuildPostgenRetryPromptOptions,
): string {
  const violationList = options.violations
    .map((violation, index) => formatViolation(violation, index))
    .join("\n");

  const modeInstruction =
    options.mode === ChatAction.GENERATE
      ? "Regenerate with ALL features fully implemented — no scaffolds, no stubs, no empty handlers. Every feature the user named must have working state, real event handlers, and navigable routes."
      : "Apply only the minimum targeted fixes required to resolve all listed validation errors.";

  return [
    "Your previous output failed deterministic validation.",
    "You must fix ALL blocking issues below in one response.",
    "",
    `Original user request: ${options.originalUserRequest}`,
    "",
    "Blocking issues:",
    violationList,
    "",
    modeInstruction,
    "Use <edward_sandbox> and complete <file> contents for each modified file.",
    `Keep every emitted <file> at or below ${MAX_EMITTED_FILE_LINES} total lines.`,
    "If a file is becoming too large, split the fix across smaller helper/component/hook/style files instead of overloading one file.",
    "Do not include markdown fences inside file content.",
    "Finish with <edward_done />.",
  ].join("\n");
}
