import { z } from "zod";
import { logger } from "../../utils/logger.js";
import {
  getContainer,
  execCommand,
  CONTAINER_WORKDIR,
} from "../sandbox/docker.sandbox.js";

const ValidationStageSchema = z.enum(["syntax", "imports", "types", "build"]);
type ValidationStage = z.infer<typeof ValidationStageSchema>;

const ValidationErrorSchema = z.object({
  stage: ValidationStageSchema,
  file: z.string().optional(),
  line: z.number().optional(),
  message: z.string(),
  ruleId: z.string().optional(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  stage: ValidationStageSchema.optional(),
  errors: z.array(ValidationErrorSchema).default([]),
  retryPrompt: z.string().optional(),
});

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

async function runContainerCommand(
  containerId: string,
  command: string[],
  timeoutMs = 30000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const container = getContainer(containerId);
  return execCommand(
    container,
    command,
    false,
    timeoutMs,
    undefined,
    CONTAINER_WORKDIR,
  );
}

async function validateSyntax(containerId: string): Promise<ValidationResult> {
  const result = await runContainerCommand(containerId, [
    "sh",
    "-c",
    'find src -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" 2>/dev/null | xargs -I{} node --check {} 2>&1',
  ]);

  const output = result.stdout + result.stderr;

  if (output && (result.exitCode !== 0 || output.includes("SyntaxError"))) {
    const errors = parseSyntaxErrors(output);
    if (errors.length > 0) {
      return { valid: false, stage: "syntax", errors };
    }
  }

  return { valid: true, errors: [] };
}

function parseSyntaxErrors(output: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = output.split("\n").filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(.+):(\d+):\s*(.+)$/);
    if (match && match[1] && match[2] && match[3]) {
      errors.push({
        stage: "syntax",
        file: match[1],
        line: parseInt(match[2], 10),
        message: match[3],
      });
    } else if (line.includes("SyntaxError") || line.includes("error")) {
      errors.push({ stage: "syntax", message: line });
    }
  }

  return errors;
}

async function validateTypes(containerId: string): Promise<ValidationResult> {
  const result = await runContainerCommand(
    containerId,
    [
      "sh",
      "-c",
      'if [ -f tsconfig.json ]; then set -o pipefail; pnpm tsc --noEmit 2>&1 | head -50; else echo "no-ts"; fi',
    ],
    60000,
  );

  if (result.stdout.includes("no-ts")) {
    return { valid: true, errors: [] };
  }

  if (result.exitCode !== 0) {
    const errors = parseTypeErrors(result.stdout + result.stderr);
    return { valid: false, stage: "types", errors };
  }

  return { valid: true, errors: [] };
}

function parseTypeErrors(output: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = output.split("\n").filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(.+)\((\d+),\d+\):\s*error\s+(\w+):\s*(.+)$/);
    if (match && match[1] && match[2] && match[3] && match[4]) {
      errors.push({
        stage: "types",
        file: match[1],
        line: parseInt(match[2], 10),
        ruleId: match[3],
        message: match[4],
      });
    }
  }

  return errors;
}

async function validateBuild(containerId: string): Promise<ValidationResult> {
  const result = await runContainerCommand(
    containerId,
    [
      "sh",
      "-c",
      'if [ -f package.json ]; then set -o pipefail; pnpm run build --if-present 2>&1 | tail -30; echo "EXIT_CODE:$?"; fi',
    ],
    120000,
  );

  const output = result.stdout + result.stderr;
  const exitMatch = output.match(/EXIT_CODE:(\d+)/);
  const exitCode = exitMatch?.[1]
    ? parseInt(exitMatch[1], 10)
    : result.exitCode;

  if (exitCode !== 0) {
    const errors: ValidationError[] = [
      {
        stage: "build",
        message: output
          .replace(/EXIT_CODE:\d+/, "")
          .trim()
          .slice(-500),
      },
    ];
    return { valid: false, stage: "build", errors };
  }

  return { valid: true, errors: [] };
}

function generateRetryPrompt(
  errors: ValidationError[],
  originalRequest: string,
): string {
  const errorList = errors
    .slice(0, 10)
    .map((e) => `- ${e.file ? `${e.file}:${e.line}: ` : ""}${e.message}`)
    .join("\n");

  return `The previous code generation failed validation.

Errors found (${errors[0]?.stage || "unknown"} stage):
${errorList}

Please fix these issues. Original request: ${originalRequest}

Focus on:
${errors[0]?.stage === "syntax" ? "- Fix syntax errors (missing brackets, semicolons, etc.)" : ""}
${errors[0]?.stage === "imports" ? "- Use correct import paths" : ""}
${errors[0]?.stage === "types" ? "- Add proper TypeScript types" : ""}`;
}

export async function runValidationPipeline(
  containerId: string,
  sandboxId: string,
  originalRequest = "",
): Promise<ValidationResult> {
  const stages: { name: ValidationStage; validate: typeof validateSyntax }[] = [
    { name: "syntax", validate: validateSyntax },
    { name: "types", validate: validateTypes },
    { name: "build", validate: validateBuild },
  ];

  try {
    for (const stage of stages) {
      const result = await stage.validate(containerId);

      if (!result.valid) {
        logger.warn(
          { sandboxId, stage: stage.name, errorCount: result.errors.length },
          "Validation failed",
        );
        return {
          valid: false,
          stage: stage.name,
          errors: result.errors,
          retryPrompt: generateRetryPrompt(result.errors, originalRequest),
        };
      }
    }

    return { valid: true, errors: [] };
  } catch (error) {
    logger.error({ error, sandboxId }, "Validation pipeline failed");
    return {
      valid: false,
      stage: "syntax",
      errors: [
        {
          stage: "syntax",
          message: error instanceof Error ? error.message : "Validation failed",
        },
      ],
    };
  }
}
