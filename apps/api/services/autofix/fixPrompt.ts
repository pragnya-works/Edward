import type { Diagnostic } from "../diagnostics/types.js";
import { formatDiagnosticsForContext, getRelatedFiles } from "../diagnostics/diagnostics.js";
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

    sections.push("You are fixing build errors in a web application. Output ONLY the complete corrected file contents.");
    sections.push("Do NOT add @ts-ignore, @ts-expect-error, eslint-disable, or type casts to `any`.");
    sections.push("Do NOT remove or modify working functionality — only fix what is broken.");
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
        strategies.push(`- ${cat}: ${strategy.approach} (priority: ${strategy.priority})`);
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
    const filePattern = /```(?:\w+)?\n([\s\S]*?)```/g;
    const pathPattern = /(?:FILE|Path|\/\/\s*file):\s*(.+)/gi;

    let currentFile: string | null = null;
    const lines = response.split("\n");

    for (const line of lines) {
        const pathMatch = line.match(pathPattern);
        if (pathMatch) {
            const extracted = pathMatch[0].replace(/(?:FILE|Path|\/\/\s*file):\s*/i, "").trim();
            if (extracted && !extracted.includes("```")) {
                currentFile = extracted;
            }
        }
    }

    let match;
    while ((match = filePattern.exec(response)) !== null) {
        if (currentFile && match[1]) {
            files.set(currentFile, match[1]);
            currentFile = null;
        }
    }

    return files;
}
