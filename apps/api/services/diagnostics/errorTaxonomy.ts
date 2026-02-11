import { DiagnosticCategory } from "./types.js";
import type { Diagnostic } from "./types.js";

type FixApproach = "install_package" | "llm_fix" | "template_fix";

interface FixStrategy {
  approach: FixApproach;
  autoFixable: boolean;
  maxAttempts: number;
  priority: number;
}

const FIX_STRATEGIES: Record<DiagnosticCategory, FixStrategy> = {
  [DiagnosticCategory.ConfigError]: {
    approach: "template_fix",
    autoFixable: true,
    maxAttempts: 1,
    priority: 0,
  },
  [DiagnosticCategory.EntryPoint]: {
    approach: "llm_fix",
    autoFixable: true,
    maxAttempts: 1,
    priority: 0,
  },
  [DiagnosticCategory.MissingModule]: {
    approach: "install_package",
    autoFixable: true,
    maxAttempts: 2,
    priority: 1,
  },
  [DiagnosticCategory.Dependency]: {
    approach: "install_package",
    autoFixable: true,
    maxAttempts: 2,
    priority: 1,
  },
  [DiagnosticCategory.SyntaxError]: {
    approach: "llm_fix",
    autoFixable: true,
    maxAttempts: 2,
    priority: 2,
  },
  [DiagnosticCategory.MissingExport]: {
    approach: "llm_fix",
    autoFixable: true,
    maxAttempts: 2,
    priority: 2,
  },
  [DiagnosticCategory.CssError]: {
    approach: "llm_fix",
    autoFixable: true,
    maxAttempts: 2,
    priority: 3,
  },
  [DiagnosticCategory.TypeError]: {
    approach: "llm_fix",
    autoFixable: true,
    maxAttempts: 3,
    priority: 3,
  },
  [DiagnosticCategory.BuildCommand]: {
    approach: "llm_fix",
    autoFixable: true,
    maxAttempts: 2,
    priority: 4,
  },
  [DiagnosticCategory.Unknown]: {
    approach: "llm_fix",
    autoFixable: false,
    maxAttempts: 2,
    priority: 5,
  },
};

export function getFixStrategy(category: DiagnosticCategory): FixStrategy {
  return FIX_STRATEGIES[category];
}

export function sortDiagnosticsByPriority(diagnostics: Diagnostic[]): void {
  diagnostics.sort((a, b) => {
    const pa = FIX_STRATEGIES[a.category].priority;
    const pb = FIX_STRATEGIES[b.category].priority;
    return pa - pb;
  });
}

export function isAutoFixable(category: DiagnosticCategory): boolean {
  return FIX_STRATEGIES[category].autoFixable;
}
