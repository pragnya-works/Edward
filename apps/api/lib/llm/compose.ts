import { CORE_SYSTEM_PROMPT, MODE_PROMPTS } from "./systemPrompt.js";
import { getSkillsForContext, type Complexity } from "./skills/index.js";
import { Framework, ChatAction } from "../../services/planning/schemas.js";
import { getTemplateConfig } from "../../services/sandbox/templates/template.registry.js";

export interface ComposeOptions {
  framework?: Framework;
  complexity?: Complexity;
  verifiedDependencies?: string[];
  mode?: (typeof ChatAction)[keyof typeof ChatAction];
}

export function composePrompt(options: ComposeOptions = {}): string {
  const {
    framework,
    complexity,
    verifiedDependencies,
    mode = ChatAction.GENERATE,
  } = options;
  const parts: string[] = [CORE_SYSTEM_PROMPT];

  if (mode === ChatAction.FIX) parts.push(MODE_PROMPTS.fix);
  if (mode === ChatAction.EDIT) parts.push(MODE_PROMPTS.edit);

  const skills = getSkillsForContext(framework, complexity);
  parts.push(...skills);

  if (verifiedDependencies && verifiedDependencies.length > 0) {
    parts.push(
      `\n[CONTEXT] These packages are verified and available: ${verifiedDependencies.join(", ")}. Use these exact names in your <edward_install> tag.`,
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
      `\n[ENVIRONMENT] You are working in a ${frameworkLabel} project. Include the required entry point files.`,
    );

    const templateConfig = getTemplateConfig(framework);
    if (templateConfig?.protectedFiles.length) {
      const protectedFiles = Array.from(new Set(templateConfig.protectedFiles));
      const protectedFilesList = protectedFiles
        .map((filePath) => `- ${filePath}`)
        .join("\n");
      parts.push(
        `\n[READ-ONLY FILES]\nThe following framework files are protected and MUST NOT be created, modified, overwritten, renamed, or deleted:\n${protectedFilesList}\nIf the user asks to edit one of these files, use an alternative implementation.`,
      );
    }
  }

  return parts.join("\n\n");
}
