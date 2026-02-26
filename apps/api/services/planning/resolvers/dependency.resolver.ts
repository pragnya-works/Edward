import { logger } from "../../../utils/logger.js";
import { resolvePackages } from "../../registry/package.registry.js";
import { PackageInfo, Framework } from "../schemas.js";
import { getFrameworkContract } from "../../sandbox/templates/framework.contracts.js";
import {
  normalizePackageSpecs,
  parsePackageSpec,
  packageNamesFromSpecs,
} from "../../packages/packageSpec.js";

function isBlockedPackage(name: string): boolean {
  const blocked = ["node-gyp", "fsevents", "esbuild", "sharp"];
  return blocked.some((b) => name.toLowerCase().includes(b));
}

export async function resolveDependencies(
  requestedPackages: string[],
  framework: Framework,
): Promise<{
  resolved: PackageInfo[];
  failed: PackageInfo[];
  warnings: string[];
}> {
  const warnings: string[] = [];

  try {
    const contract = getFrameworkContract(framework);
    const normalizedRequestedSpecs = normalizePackageSpecs(requestedPackages);
    const normalizedCoreSpecs = normalizePackageSpecs(
      contract.runtimeDependencies,
    );

    const allSpecs = normalizePackageSpecs([
      ...normalizedCoreSpecs,
      ...normalizedRequestedSpecs,
    ]);
    const allPackageNames = packageNamesFromSpecs(allSpecs);
    const filteredNames = allPackageNames.filter((pkgName) => {
      if (isBlockedPackage(pkgName)) {
        warnings.push(`Skipped blocked package: ${pkgName}`);
        return false;
      }
      return true;
    });

    const preferredVersions = new Map<string, string>();
    for (const spec of allSpecs) {
      const parsed = parsePackageSpec(spec);
      if (!parsed?.version) continue;
      if (!preferredVersions.has(parsed.name)) {
        preferredVersions.set(parsed.name, parsed.version);
      }
    }

    logger.debug(
      { framework, count: filteredNames.length },
      "Resolving dependencies",
    );

    const { valid, invalid, conflicts } = await resolvePackages(filteredNames);

    if (conflicts.length > 0) {
      warnings.push(...conflicts.map((c) => `Peer conflict: ${c}`));
    }

    const resolved: PackageInfo[] = valid.map((v) => ({
      name: v.name,
      version: preferredVersions.get(v.name) ?? v.version ?? "latest",
      valid: true,
      peerDependencies: v.peerDependencies,
    }));

    const requestedNames = new Set(packageNamesFromSpecs(normalizedRequestedSpecs));
    const failed: PackageInfo[] = invalid
      .filter((i) => requestedNames.has(i.name))
      .map((i) => ({
        name: i.name,
        version: "",
        valid: false,
        error: i.error,
      }));

    return { resolved, failed, warnings };
  } catch (error) {
    logger.error({ error, framework }, "Dependency resolution failed");
    return {
      resolved: [],
      failed: normalizePackageSpecs(requestedPackages).map((spec) => {
        const parsed = parsePackageSpec(spec);
        return {
          name: parsed?.name ?? spec,
          version: "",
          valid: false,
          error: "Resolution failed",
        };
      }),
      warnings: [
        "Resolution failed: " +
          (error instanceof Error ? error.message : "Unknown error"),
      ],
    };
  }
}

export function suggestAlternatives(failedPackage: string): string[] {
  const alternatives: Record<string, string[]> = {
    moment: ["dayjs", "date-fns"],
    axios: ["ky", "got"],
    lodash: ["lodash-es", "radash"],
    "styled-components": ["emotion", "@emotion/react"],
    redux: ["zustand", "jotai", "valtio"],
  };

  return alternatives[failedPackage] || [];
}