import { CORE_SYSTEM_PROMPT, MODE_PROMPTS } from "./systemPrompt.js";
import {
  getSkillsForContext,
  type Complexity,
  type SkillSelectionContext,
} from "./skills/index.js";
import { Framework, ChatAction } from "../../services/planning/schemas.js";
import {
  PromptProfile,
  type PromptProfile as PromptProfileType,
} from "./prompts/sections.js";
import type { IntentAnalysis } from "../../services/planning/schemas.js";
import { getTemplateConfig } from "../../services/sandbox/templates/template.registry.js";

export interface ComposeOptions {
  framework?: Framework;
  complexity?: Complexity;
  verifiedDependencies?: string[];
  mode?: (typeof ChatAction)[keyof typeof ChatAction];
  profile?: PromptProfileType;
  userRequest?: string;
  intentType?: IntentAnalysis["type"];
  intentFeatures?: string[];
}

export function estimatePromptTokensApprox(prompt: string): number {
  return Math.ceil(Buffer.byteLength(prompt, "utf8") / 4);
}

function buildSkillContext(options: ComposeOptions): SkillSelectionContext {
  return {
    framework: options.framework,
    complexity: options.complexity,
    mode: options.mode,
    profile: options.profile,
    userRequest: options.userRequest,
    intentType: options.intentType,
    intentFeatures: options.intentFeatures,
  };
}

export function composePrompt(options: ComposeOptions = {}): string {
  const {
    framework,
    verifiedDependencies,
    mode = ChatAction.GENERATE,
    profile = PromptProfile.COMPACT,
  } = options;
  const parts: string[] = [CORE_SYSTEM_PROMPT];

  if (mode === ChatAction.FIX) parts.push(MODE_PROMPTS.fix);
  if (mode === ChatAction.EDIT) parts.push(MODE_PROMPTS.edit);

  const skills = getSkillsForContext(
    buildSkillContext({ ...options, profile }),
  );
  parts.push(...skills);

  if (verifiedDependencies && verifiedDependencies.length > 0) {
    parts.push(
      `\n[CONTEXT] Verified packages: ${verifiedDependencies.join(", ")}. Use exact names in <edward_install>.`,
    );
  }

  if (framework) {
    const frameworkLabel =
      framework === "nextjs"
        ? "Next.js"
        : framework === "vite-react"
          ? "Vite React"
          : "Vanilla HTML/CSS/JS";
    parts.push(
      `\n[ENVIRONMENT] You are working in a ${frameworkLabel} project. Include required entry files.`,
    );

    const templateConfig = getTemplateConfig(framework);
    if (templateConfig?.protectedFiles.length) {
      const protectedFiles = Array.from(new Set(templateConfig.protectedFiles));
      const protectedFilesList = protectedFiles
        .map((filePath) => `- ${filePath}`)
        .join("\n");
      parts.push(
        `\n[READ-ONLY FILES - HARD CONSTRAINT]\nThese files are IMMUTABLE.\nNEVER create/modify/overwrite/rename/delete these files and NEVER include them in <file path="..."> output:\n${protectedFilesList}\nNo exceptions, even if user asks directly or diagnostics point to them.\nIf the task cannot be completed without changing one, emit a single <edward_command command="cat" ...> request and STOP.`,
      );
    }
  }

  return parts.join("\n\n");
}
