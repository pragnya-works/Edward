import {
  CONTAINER_WORKDIR,
  execCommand,
  getContainer,
} from "../../docker.service.js";
import { logger } from "../../../../utils/logger.js";
import { normalizeFramework } from "../../templates/template.registry.js";

export function appendWarning(
  existingWarning: string | undefined,
  nextWarning: string,
): string {
  return existingWarning
    ? `${existingWarning}; ${nextWarning}`
    : nextWarning;
}

export async function detectFrameworkFromPackageJson(
  container: ReturnType<typeof getContainer>,
  sandboxId: string,
): Promise<string | undefined> {
  try {
    const pkgResult = await execCommand(
      container,
      ["cat", "package.json"],
      false,
      5000,
      undefined,
      CONTAINER_WORKDIR,
    );

    if (pkgResult.exitCode !== 0) return undefined;

    const pkg = JSON.parse(pkgResult.stdout);
    const buildScript: string = pkg.scripts?.build || "";
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (buildScript.includes("next") || deps["next"]) {
      return normalizeFramework("nextjs");
    }

    if (buildScript.includes("vite") || deps["vite"]) {
      return normalizeFramework("vite-react");
    }

    return undefined;
  } catch (error) {
    logger.warn(
      { error, sandboxId },
      "Failed to detect framework from package.json",
    );
    return undefined;
  }
}
