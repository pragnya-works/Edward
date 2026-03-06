import {
  getContainer,
  execCommand,
  CONTAINER_WORKDIR,
  readFileContent,
} from "./sandbox/sandbox-runtime.service.js";
import { config } from "../app.config.js";
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

interface ParsedPackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value).every((entry) => typeof entry === "string"),
  );
}

function parsePackageJsonContent(content: string): ParsedPackageJson | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const safeParsed = parsed as Record<string, unknown>;

  if (safeParsed.scripts !== undefined && !isStringRecord(safeParsed.scripts)) {
    return null;
  }

  if (
    safeParsed.dependencies !== undefined &&
    !isStringRecord(safeParsed.dependencies)
  ) {
    return null;
  }

  if (
    safeParsed.devDependencies !== undefined &&
    !isStringRecord(safeParsed.devDependencies)
  ) {
    return null;
  }

  return {
    scripts: safeParsed.scripts,
    dependencies: safeParsed.dependencies,
    devDependencies: safeParsed.devDependencies,
  };
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

function normalizeRequestedFramework(framework?: string): Framework | undefined {
  if (!framework) {
    return undefined;
  }

  switch (framework.toLowerCase()) {
    case "next":
    case "next.js":
    case "nextjs":
      return "nextjs";
    case "react":
    case "vite":
    case "vite-react":
      return "vite-react";
    case "vanilla":
      return "vanilla";
    default:
      return undefined;
  }
}

function resolveBuildCommand(): string[] {
  return ["pnpm", "run", "build"];
}

function fallbackNodeVersionFromRuntime(): string | null {
  const match = config.vercel.runtime.match(/^node(\d+)$/);
  if (!match) {
    return null;
  }

  return `${match[1]}.0.0`;
}

async function detectNodeVersion(
  container: ReturnType<typeof getContainer>,
  sandboxId: string,
): Promise<string | null> {
  const directResult = await execCommand(
    container,
    ["node", "-p", "process.versions.node"],
    false,
    5000,
    undefined,
    CONTAINER_WORKDIR,
  );

  const directVersion = directResult.stdout.trim();
  if (directResult.exitCode === 0 && directVersion) {
    return directVersion;
  }

  const fileProbeResult = await execCommand(
    container,
    [
      "sh",
      "-lc",
      "mkdir -p .edward && node -p process.versions.node > .edward/node-version",
    ],
    false,
    5000,
    undefined,
    CONTAINER_WORKDIR,
  );

  if (fileProbeResult.exitCode === 0) {
    const fileVersion = (
      await readFileContent(container, ".edward/node-version", CONTAINER_WORKDIR)
    )?.trim();
    if (fileVersion) {
      return fileVersion;
    }
  }

  const runtimeVersion = fallbackNodeVersionFromRuntime();
  if (runtimeVersion) {
    logger.warn(
      {
        sandboxId,
        directExitCode: directResult.exitCode,
        fileProbeExitCode: fileProbeResult.exitCode,
        runtime: config.vercel.runtime,
      },
      "Falling back to configured Vercel runtime for Node.js version detection",
    );
    return runtimeVersion;
  }

  return null;
}

export async function runUnifiedBuild(
  containerId: string,
  sandboxId: string,
  options?: BuildOptions,
): Promise<BuildResult> {
  const container = getContainer(containerId);
  const requestedFramework = normalizeRequestedFramework(options?.framework);

  try {
    const basePath =
      options?.userId && options?.chatId
        ? calculateBasePath(options.userId, options.chatId)
        : "";

    const packageJsonContent = await readFileContent(
      container,
      "package.json",
      CONTAINER_WORKDIR,
    );

    if (!packageJsonContent) {
      logger.warn({ sandboxId }, "No package.json found");
      const outputInfo = await detectBuildOutput(containerId, sandboxId);
      return { success: true, outputInfo };
    }

    const pkg = parsePackageJsonContent(packageJsonContent);
    if (!pkg) {
      return {
        success: false,
        error: "Failed to parse package.json in sandbox.",
      };
    }

    if (!pkg.scripts?.build) {
      logger.warn({ sandboxId }, "No build script found in package.json");
      const outputInfo = await detectBuildOutput(containerId, sandboxId);
      return { success: true, outputInfo };
    }

    const nodeVersion = await detectNodeVersion(container, sandboxId);

    if (!nodeVersion) {
      return {
        success: false,
        error: "Failed to detect Node.js version in sandbox.",
      };
    }

    const framework: Framework =
      requestedFramework ?? inferFrameworkFromPackageJson(pkg);

    if (options?.userId && options?.chatId) {
      await injectBasePathConfigs(
        containerId,
        {
          userId: options.userId,
          chatId: options.chatId,
          framework,
        },
        sandboxId,
      );
    }

    const compatibility = evaluateFrameworkToolchainCompatibility({
      framework,
      nodeVersion,
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

    const buildCommand = resolveBuildCommand();
    const buildResult = await execCommand(
      container,
      buildCommand,
      false,
      TIMEOUT_BUILD_MS,
      undefined,
      CONTAINER_WORKDIR,
      ["NEXT_TELEMETRY_DISABLED=1", "CI=true", `EDWARD_BASE_PATH=${basePath}`],
    );

    if (buildResult.exitCode !== 0) {
      logger.error(
        { sandboxId, exitCode: buildResult.exitCode, buildCommand },
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
