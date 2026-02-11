import type { Diagnostic } from "../diagnostics/types.js";

export interface DiagnosticComparison {
    previousCount: number;
    currentCount: number;
    fixedIds: string[];
    newIds: string[];
    persistingIds: string[];
    progress: number;
    isRegression: boolean;
}

export function compareDiagnostics(
    previous: Diagnostic[],
    current: Diagnostic[],
): DiagnosticComparison {
    const prevIds = new Set(previous.map((d) => d.id));
    const currIds = new Set(current.map((d) => d.id));

    const fixedIds = previous.filter((d) => !currIds.has(d.id)).map((d) => d.id);
    const newIds = current.filter((d) => !prevIds.has(d.id)).map((d) => d.id);
    const persistingIds = current.filter((d) => prevIds.has(d.id)).map((d) => d.id);

    const progress = previous.length > 0
        ? ((previous.length - current.length) / previous.length) * 100
        : 0;

    const isRegression = newIds.length > fixedIds.length;

    return {
        previousCount: previous.length,
        currentCount: current.length,
        fixedIds,
        newIds,
        persistingIds,
        progress,
        isRegression,
    };
}

export function shouldContinueFixing(
    comparison: DiagnosticComparison,
    attempt: number,
    maxAttempts: number,
): boolean {
    if (comparison.currentCount === 0) return false;
    if (attempt >= maxAttempts) return false;
    if (comparison.isRegression) return false;
    if (comparison.progress <= 0 && attempt > 1) return false;
    return true;
}
