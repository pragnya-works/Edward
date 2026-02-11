import type { Diagnostic } from "../diagnostics/types.js";
import {
  formatDiagnosticsForContext,
  getRelatedFiles,
} from "../diagnostics/diagnostics.js";
import { getFixStrategy } from "../diagnostics/errorTaxonomy.js";

interface PromptContext {
  diagnostics: Diagnostic[];
  fileContents: Map<string, string>;
  packageJson?: string;
  tsConfig?: string;
  previousAttemptDiff?: string;
  framework?: string;
}

export function buildFixPrompt(context: PromptContext): string {
  const sections: string[] = [];

  sections.push(
    "You are fixing build errors in a web application. Output ONLY the complete corrected file contents.",
  );
  sections.push(
    "Do NOT add @ts-ignore, @ts-expect-error, eslint-disable, or type casts to `any`.",
  );
  sections.push(
    "Do NOT remove or modify working functionality — only fix what is broken.",
  );
  sections.push("");

  if (context.framework) {
    sections.push(`FRAMEWORK: ${context.framework}`);
    sections.push("");
  }

  sections.push(formatDiagnosticsForContext(context.diagnostics));

  const fixableCategories = new Set(context.diagnostics.map((d) => d.category));
  const strategies: string[] = [];
  for (const cat of fixableCategories) {
    const strategy = getFixStrategy(cat);
    strategies.push(
      `- ${cat}: ${strategy.approach} (priority: ${strategy.priority})`,
    );
  }
  sections.push("FIX STRATEGIES:");
  sections.push(strategies.join("\n"));
  sections.push("");

  if (context.packageJson) {
    sections.push("PACKAGE.JSON:");
    sections.push(context.packageJson.slice(0, 2000));
    sections.push("");
  }

  if (context.tsConfig) {
    sections.push("TSCONFIG.JSON:");
    sections.push(context.tsConfig.slice(0, 1000));
    sections.push("");
  }

  if (context.previousAttemptDiff) {
    sections.push("PREVIOUS ATTEMPT (this failed, try a different approach):");
    sections.push(context.previousAttemptDiff.slice(0, 3000));
    sections.push("");
  }

  const relatedFiles = getRelatedFiles(context.diagnostics);
  for (const file of relatedFiles) {
    const content = context.fileContents.get(file);
    if (content) {
      sections.push(`FILE: ${file}`);
      sections.push("```");
      sections.push(content.slice(0, 5000));
      sections.push("```");
      sections.push("");
    }
  }

  return sections.join("\n");
}

export function extractFileFromResponse(response: string): Map<string, string> {
  const files = new Map<string, string>();
  const lines = response.split("\n");

  let currentFile: string | null = null;
  let currentContent: string[] = [];
  let inCodeBlock = false;

  const pathPattern = /^(?:FILE|Path|\/\/\s*file):\s*(.+)/i;
  const codeBlockStart = /^```(?:\w+)?$/;
  const codeBlockEnd = /^```$/;

  for (const line of lines) {
    const pathMatch = line.match(pathPattern);
    if (pathMatch && !inCodeBlock) {
      if (currentFile && currentContent.length > 0) {
        files.set(currentFile, currentContent.join("\n"));
      }
      const extracted = pathMatch[1]?.trim();
      if (extracted && !extracted.includes("```")) {
        currentFile = extracted;
        currentContent = [];
      }
      continue;
    }

    if (codeBlockStart.test(line) && !inCodeBlock) {
      inCodeBlock = true;
      continue;
    }

    if (codeBlockEnd.test(line) && inCodeBlock) {
      inCodeBlock = false;
      if (currentFile && currentContent.length > 0) {
        files.set(currentFile, currentContent.join("\n"));
        currentFile = null;
        currentContent = [];
      }
      continue;
    }

    if (inCodeBlock && currentFile) {
      currentContent.push(line);
    }
  }

  if (currentFile && currentContent.length > 0) {
    files.set(currentFile, currentContent.join("\n"));
  }

  return files;
}
