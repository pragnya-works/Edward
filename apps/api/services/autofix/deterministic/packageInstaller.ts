import {
    getContainer,
    execCommand,
    CONTAINER_WORKDIR,
} from "../../sandbox/docker.sandbox.js";
import { getSandboxState } from "../../sandbox/state.sandbox.js";
import { logger } from "../../../utils/logger.js";
import type { Diagnostic } from "../../diagnostics/types.js";
import { DiagnosticCategory } from "../../diagnostics/types.js";

export interface InstallResult {
    installed: string[];
    failed: string[];
}

export async function installMissingPackages(
    sandboxId: string,
    diagnostics: Diagnostic[],
): Promise<InstallResult> {
    const packages = extractPackageNames(diagnostics);
    if (packages.length === 0) return { installed: [], failed: [] };

    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) throw new Error(`Sandbox not found: ${sandboxId}`);

    const container = getContainer(sandbox.containerId);
    const installed: string[] = [];
    const failed: string[] = [];

    for (const pkg of packages) {
        if (!isValidPackageName(pkg)) {
            logger.warn({ sandboxId, pkg }, "Skipping invalid package name");
            failed.push(pkg);
            continue;
        }

        const result = await execCommand(
            container,
            ["pnpm", "add", pkg],
            false,
            120000,
            undefined,
            CONTAINER_WORKDIR,
            ["NEXT_TELEMETRY_DISABLED=1", "CI=true"],
        );

        if (result.exitCode === 0) {
            installed.push(pkg);
            logger.info({ sandboxId, pkg }, "Package installed successfully");
        } else {
            failed.push(pkg);
            logger.warn({ sandboxId, pkg, stderr: result.stderr?.slice(-200) }, "Package installation failed");
        }
    }

    return { installed, failed };
}

function extractPackageNames(diagnostics: Diagnostic[]): string[] {
    const packages = new Set<string>();

    for (const d of diagnostics) {
        if (d.category !== DiagnosticCategory.MissingModule && d.category !== DiagnosticCategory.Dependency) continue;

        const quoted = d.message.match(/['"]([^'"]+)['"]/);
        if (quoted?.[1]) {
            const name = quoted[1];
            if (name.startsWith(".") || name.startsWith("/")) continue;
            packages.add(name);
            continue;
        }

        const cannotFind = d.message.match(/Cannot find module\s+(\S+)/);
        if (cannotFind?.[1]) {
            const name = cannotFind[1].replace(/['"]/g, "");
            if (!name.startsWith(".") && !name.startsWith("/")) {
                packages.add(name);
            }
        }
    }

    return Array.from(packages);
}

function isValidPackageName(name: string): boolean {
    if (name.length > 214) return false;
    if (name.startsWith(".") || name.startsWith("_")) return false;
    return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name);
}
