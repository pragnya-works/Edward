import type { Diagnostic } from "../diagnostics/types.js";

export interface AutofixOptions {
  sandboxId: string;
  containerId: string;
  apiKey: string;
  framework?: string;
  maxAttempts?: number;
}

export interface AutofixAttempt {
  attempt: number;
  diagnosticsBefore: number;
  diagnosticsAfter: number;
  fixedCount: number;
  newCount: number;
  buildSuccess: boolean;
  actions: string[];
}

export interface AutofixResult {
  success: boolean;
  attempts: AutofixAttempt[];
  initialDiagnostics: Diagnostic[];
  finalDiagnostics: Diagnostic[];
  deterministicActions: string[];
  totalDuration: number;
}

export const DEFAULT_MAX_ATTEMPTS = 3;
export const MAX_FILES_PER_PROMPT = 10;
export const BUILD_TIMEOUT_MS = 60000;
export const TSC_TIMEOUT_MS = 30000;
