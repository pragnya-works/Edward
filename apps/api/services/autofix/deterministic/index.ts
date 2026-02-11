import { logger } from "../../../utils/logger.js";
import type { Diagnostic } from "../../diagnostics/types.js";
import { DiagnosticCategory } from "../../diagnostics/types.js";
import { installMissingPackages } from "./packageInstaller.js";
import { resolveImports } from "./importResolver.js";
import { fixConfigFiles } from "./configFixer.js";
import { sortDiagnosticsByPriority, isAutoFixable } from "../../diagnostics/errorTaxonomy.js";

export interface DeterministicFixResult {
    fixedDiagnostics: Diagnostic[];
    remainingDiagnostics: Diagnostic[];
    actions: string[];
}

export async function runDeterministicFixes(
    sandboxId: string,
    diagnostics: Diagnostic[],
    framework?: string,
): Promise<DeterministicFixResult> {
    const fixedDiagnostics: Diagnostic[] = [];
    const actions: string[] = [];
    const remaining = [...diagnostics];

    sortDiagnosticsByPriority(remaining);

    const packageDiags = remaining.filter(
        (d) => d.category === DiagnosticCategory.MissingModule || d.category === DiagnosticCategory.Dependency,
    );

    if (packageDiags.length > 0) {
        const result = await installMissingPackages(sandboxId, packageDiags);
        if (result.installed.length > 0) {
            actions.push(`Installed packages: ${result.installed.join(", ")}`);
            const installedSet = new Set(result.installed);
            for (const d of packageDiags) {
                const pkg = d.message.match(/['"]([^'"]+)['"]/)?.[1];
                if (pkg && installedSet.has(pkg)) {
                    fixedDiagnostics.push(d);
                }
            }
        }
    }

    const importDiags = remaining.filter(
        (d) =>
            d.category === DiagnosticCategory.MissingExport ||
            (d.category === DiagnosticCategory.MissingModule && !fixedDiagnostics.includes(d)),
    );

    if (importDiags.length > 0) {
        const result = await resolveImports(sandboxId, importDiags);
        if (result.resolved.length > 0) {
            actions.push(`Resolved ${result.resolved.length} import(s)`);
            fixedDiagnostics.push(...result.resolved);
        }
    }

    const configDiags = remaining.filter(
        (d) => d.category === DiagnosticCategory.ConfigError && !fixedDiagnostics.includes(d),
    );

    if (configDiags.length > 0) {
        const result = await fixConfigFiles(sandboxId, configDiags, framework);
        if (result.fixed.length > 0) {
            actions.push(`Regenerated config files: ${result.fixed.join(", ")}`);
            for (const d of configDiags) {
                if (result.fixed.some((f) => d.message.toLowerCase().includes(f.toLowerCase()))) {
                    fixedDiagnostics.push(d);
                }
            }
        }
    }

    const fixedIds = new Set(fixedDiagnostics.map((d) => d.id));
    const remainingDiagnostics = remaining.filter((d) => !fixedIds.has(d.id));

    logger.info(
        {
            sandboxId,
            totalDiagnostics: diagnostics.length,
            deterministicallyFixed: fixedDiagnostics.length,
            remaining: remainingDiagnostics.length,
            actions,
        },
        "Deterministic fix phase completed",
    );

    return {
        fixedDiagnostics,
        remainingDiagnostics,
        actions,
    };
}

export function filterAutoFixable(diagnostics: Diagnostic[]): Diagnostic[] {
    return diagnostics.filter((d) => isAutoFixable(d.category));
}
