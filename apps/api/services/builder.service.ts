import {
  getContainer,
  execCommand,
  CONTAINER_WORKDIR,
} from "./sandbox/docker.service.js";
import { logger } from "../utils/logger.js";
import {
  detectBuildOutput,
  BuildOutputInfo,
} from "./sandbox/builder/output.detector.js";
import { TIMEOUT_BUILD_MS } from "./sandbox/utils.service.js";
import {
  injectBasePathConfigs,
  calculateBasePath,
} from "./sandbox/builder/basePathInjector.js";
import type { Framework } from "./planning/schemas.js";
import { evaluateFrameworkToolchainCompatibility } from "./sandbox/templates/toolchain.compatibility.js";

export interface BuildResult {
  success: boolean;
  outputInfo?: BuildOutputInfo;
  error?: string;
}

export interface BuildOptions {
  userId: string;
  chatId: string;
  framework?: string;
}

function inferFrameworkFromPackageJson(
  pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  },
): Framework {
  const dependencies = pkg.dependencies ?? {};
  const devDependencies = pkg.devDependencies ?? {};

  if (dependencies.next) return "nextjs";
  if (dependencies.vite || devDependencies.vite) return "vite-react";
  return "vanilla";
}

export async function runUnifiedBuild(
  containerId: string,
  sandboxId: string,
  options?: BuildOptions,
): Promise<BuildResult> {
  const container = getContainer(containerId);

  try {
    if (options?.userId && options?.chatId) {
      const framework = options.framework || "vanilla";
      await injectBasePathConfigs(
        containerId,
        {
          userId: options.userId,
          chatId: options.chatId,
          framework: framework as "nextjs" | "vite-react" | "vanilla",
        },
        sandboxId,
      );
    }

    const basePath =
      options?.userId && options?.chatId
        ? calculateBasePath(options.userId, options.chatId)
        : "";

    const pkgResult = await execCommand(
      container,
      ["cat", "package.json"],
      false,
      undefined,
      undefined,
      CONTAINER_WORKDIR,
    );
    const hasPackageJson = pkgResult.exitCode === 0;

    if (!hasPackageJson) {
      logger.warn({ sandboxId }, "No package.json found");
      const outputInfo = await detectBuildOutput(containerId, sandboxId);
      return { success: true, outputInfo };
    }

    const pkg = JSON.parse(pkgResult.stdout) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    if (!pkg.scripts?.build) {
      logger.warn({ sandboxId }, "No build script found in package.json");
      const outputInfo = await detectBuildOutput(containerId, sandboxId);
      return { success: true, outputInfo };
    }

    const nodeVersionResult = await execCommand(
      container,
      ["node", "-p", "process.versions.node"],
      false,
      5000,
      undefined,
      CONTAINER_WORKDIR,
    );

    if (nodeVersionResult.exitCode !== 0) {
      return {
        success: false,
        error: `Failed to detect Node.js version in sandbox: ${nodeVersionResult.stderr || nodeVersionResult.stdout}`,
      };
    }

    const framework = (options?.framework as Framework | undefined) ??
      inferFrameworkFromPackageJson(pkg);
    const compatibility = evaluateFrameworkToolchainCompatibility({
      framework,
      nodeVersion: nodeVersionResult.stdout.trim(),
      packageJson: {
        dependencies: pkg.dependencies,
        devDependencies: pkg.devDependencies,
      },
    });

    if (!compatibility.compatible) {
      return {
        success: false,
        error: [
          "Toolchain compatibility check failed.",
          ...compatibility.issues.map((issue) => `- ${issue}`),
          "Rebuild sandbox templates or align package versions before rerunning build.",
        ].join("\n"),
      };
    }

    const buildResult = await execCommand(
      container,
      ["pnpm", "run", "build"],
      false,
      TIMEOUT_BUILD_MS,
      undefined,
      CONTAINER_WORKDIR,
      ["NEXT_TELEMETRY_DISABLED=1", "CI=true", `EDWARD_BASE_PATH=${basePath}`],
    );

    if (buildResult.exitCode !== 0) {
      logger.error(
        { sandboxId, exitCode: buildResult.exitCode },
        "Build failed",
      );
      logger.debug(
        {
          sandboxId,
          stdout: buildResult.stdout.slice(-500),
          stderr: buildResult.stderr.slice(-500),
        },
        "Build failure details",
      );

      return {
        success: false,
        error: [
          `Build failed (exit ${buildResult.exitCode})`,
          "--- STDERR (tail) ---",
          (buildResult.stderr || "").slice(-8000),
          "--- STDOUT (tail) ---",
          (buildResult.stdout || "").slice(-8000),
        ].join("\n"),
      };
    }

    const outputInfo = await detectBuildOutput(containerId, sandboxId);
    return { success: true, outputInfo };
  } catch (error) {
    logger.error({ error, sandboxId }, "Error during unified build process");
    return {
      success: false,
      error: `Build process error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
