import {
  getContainer,
  execCommand,
  CONTAINER_WORKDIR,
} from "../../sandbox/docker.sandbox.js";
import { getSandboxState } from "../../sandbox/state.sandbox.js";
import { logger } from "../../../utils/logger.js";
import type { Diagnostic } from "../../diagnostics/types.js";
import { DiagnosticCategory } from "../../diagnostics/types.js";

export interface ImportResolveResult {
  resolved: Diagnostic[];
  unresolved: Diagnostic[];
}

export async function resolveImports(
  sandboxId: string,
  diagnostics: Diagnostic[],
): Promise<ImportResolveResult> {
  const importDiags = diagnostics.filter(
    (d) =>
      d.category === DiagnosticCategory.MissingModule &&
      isLocalImport(d.message),
  );

  if (importDiags.length === 0) {
    return { resolved: [], unresolved: [] };
  }

  const sandbox = await getSandboxState(sandboxId);
  if (!sandbox) throw new Error(`Sandbox not found: ${sandboxId}`);

  const container = getContainer(sandbox.containerId);
  const resolved: Diagnostic[] = [];
  const unresolved: Diagnostic[] = [];

  for (const d of importDiags) {
    const modulePath = extractModulePath(d.message);
    if (!modulePath) {
      unresolved.push(d);
      continue;
    }

    const found = await findFileWithExtension(container, modulePath);
    if (found) {
      resolved.push(d);
      logger.info(
        { sandboxId, original: modulePath, found },
        "Resolved import to existing file",
      );
    } else {
      unresolved.push(d);
    }
  }

  return { resolved, unresolved };
}

function isLocalImport(message: string): boolean {
  const match = message.match(/['"]([^'"]+)['"]/);
  return match?.[1]?.startsWith(".") ?? false;
}

function extractModulePath(message: string): string | null {
  const match = message.match(/['"]([^'"]+)['"]/);
  return match?.[1] ?? null;
}

async function findFileWithExtension(
  container: ReturnType<typeof getContainer>,
  modulePath: string,
): Promise<string | null> {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ""];
  const suffixes = ["", "/index"];

  for (const suffix of suffixes) {
    for (const ext of extensions) {
      const testPath = `${modulePath}${suffix}${ext}`;
      const result = await execCommand(
        container,
        ["test", "-f", testPath],
        false,
        3000,
        undefined,
        CONTAINER_WORKDIR,
      );
      if (result.exitCode === 0) return testPath;
    }
  }

  return null;
}
