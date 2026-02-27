import type { Framework } from "../../planning/schemas.js";
import { getFrameworkContract } from "./framework.contracts.js";

interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface SemverTuple {
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(input: string): SemverTuple | null {
  const match = input.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;

  return {
    major: Number(match[1] || 0),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
  };
}

function isAtLeast(current: SemverTuple, minimum: SemverTuple): boolean {
  if (current.major !== minimum.major) return current.major > minimum.major;
  if (current.minor !== minimum.minor) return current.minor >= minimum.minor;
  return current.patch >= minimum.patch;
}

function getDependencySpec(
  packageJson: PackageJsonLike,
  packageName: string,
): string | undefined {
  return (
    packageJson.dependencies?.[packageName] ??
    packageJson.devDependencies?.[packageName]
  );
}

function getDependencyMajor(
  packageJson: PackageJsonLike,
  packageName: string,
): number | null {
  const spec = getDependencySpec(packageJson, packageName);
  if (!spec) return null;
  return parseSemver(spec)?.major ?? null;
}

export function evaluateFrameworkToolchainCompatibility(input: {
  framework: Framework;
  nodeVersion: string;
  packageJson: PackageJsonLike;
}): { compatible: boolean; issues: string[] } {
  const issues: string[] = [];
  const node = parseSemver(input.nodeVersion);
  if (!node) {
    issues.push(
      `Could not parse Node.js version "${input.nodeVersion}" for toolchain compatibility check.`,
    );
    return { compatible: false, issues };
  }

  const minNode = parseSemver(
    getFrameworkContract(input.framework).minimumNodeVersion,
  );
  if (minNode && !isAtLeast(node, minNode)) {
    issues.push(
      `${input.framework} requires Node.js >= ${minNode.major}.${minNode.minor}.${minNode.patch}, but sandbox is ${input.nodeVersion}.`,
    );
  }

  if (input.framework === "vite-react") {
    const viteMajor = getDependencyMajor(input.packageJson, "vite");
    if (viteMajor !== null && viteMajor >= 7) {
      const minForVite7: SemverTuple = { major: 20, minor: 19, patch: 0 };
      if (!isAtLeast(node, minForVite7)) {
        issues.push(
          `Vite ${viteMajor}.x requires Node.js >= 20.19.0, but sandbox is ${input.nodeVersion}.`,
        );
      }
    }
  }

  return { compatible: issues.length === 0, issues };
}
