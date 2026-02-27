import { logger } from "../../../utils/logger.js";
import { getSandboxState, saveSandboxState } from "../state.service.js";
import { normalizePackageSpecs } from "../../packages/packageSpec.js";

export async function addSandboxPackages(sandboxId: string, packages: string[]): Promise<void> {
  try {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) return;

    const existing = sandbox.requestedPackages || [];
    const updated = normalizePackageSpecs([...existing, ...packages]);

    if (updated.length !== existing.length) {
      sandbox.requestedPackages = updated;
      await saveSandboxState(sandbox);
      logger.debug({ sandboxId, newPackages: packages.length, totalPackages: updated.length }, 'Sandbox packages updated');
    }
  } catch (error) {
    logger.error({ error, sandboxId }, 'Failed to update sandbox packages');
  }
}
