import {
  connectToNetwork,
  getContainer,
  execCommand,
  CONTAINER_WORKDIR,
} from "../docker.sandbox.js";
import { getSandboxState, saveSandboxState } from "../state.sandbox.js";
import { logger } from "../../../utils/logger.js";
import { ensureError } from "../../../utils/error.js";
import { runUnifiedBuild, BuildOptions } from "../../builder.service.js";
import { uploadBuildFilesToS3, uploadSpaFallback } from "../upload.sandbox.js";
import { buildPreviewUrl } from "../../preview.service.js";
import { cleanupS3FolderExcept } from "../../storage.service.js";
import { buildS3Key } from "../../storage/key.utils.js";
import { config, DEPLOYMENT_TYPES } from "../../../config.js";
import {
  disconnectContainerFromNetwork,
  TIMEOUT_DEPENDENCY_INSTALL_MS,
} from "../utils.sandbox.js";
import { Framework } from "../../planning/schemas.js";
import { mergeAndInstallDependencies } from "../templates/dependency.merger.js";
import { invalidatePreviewCache } from "../../storage/cdn.js";
import { normalizeFramework } from "../templates/template.registry.js";
import { registerPreviewSubdomain } from "../../previewRouting.service.js";

export interface BuildResult {
  success: boolean;
  buildDirectory: string | null;
  error?: string;
  previewUploaded: boolean;
  previewUrl: string | null;
}

function appendWarning(
  existingWarning: string | undefined,
  nextWarning: string,
): string {
  return existingWarning
    ? `${existingWarning}; ${nextWarning}`
    : nextWarning;
}

export async function buildAndUploadUnified(
  sandboxId: string,
): Promise<BuildResult> {
  const sandbox = await getSandboxState(sandboxId);

  if (!sandbox) {
    return {
      success: false,
      buildDirectory: null,
      error: "Sandbox not found",
      previewUploaded: false,
      previewUrl: null,
    };
  }

  const { containerId, userId, chatId } = sandbox;
  let { scaffoldedFramework } = sandbox;

  try {
    await connectToNetwork(containerId);
    const container = getContainer(containerId);

    const pnpmCheck = await execCommand(
      container,
      ["which", "pnpm"],
      false,
      5000,
    );
    if (pnpmCheck.exitCode !== 0) {
      logger.warn(
        { sandboxId },
        "pnpm not found in container, installing globally",
      );
      const pnpmInstall = await execCommand(
        container,
        ["npm", "install", "-g", "pnpm"],
        false,
        60000,
        "root",
      );
      if (pnpmInstall.exitCode !== 0) {
        logger.error(
          { sandboxId, stderr: pnpmInstall.stderr.slice(-300) },
          "Failed to install pnpm in container",
        );
        await disconnectContainerFromNetwork(containerId, sandboxId);
        return {
          success: false,
          buildDirectory: null,
          error: [
            "Cannot install pnpm",
            "--- STDERR (tail) ---",
            (pnpmInstall.stderr || "").slice(-4000),
            "--- STDOUT (tail) ---",
            (pnpmInstall.stdout || "").slice(-4000),
          ].join("\n"),
          previewUploaded: false,
          previewUrl: null,
        };
      }
    }

    if (!scaffoldedFramework) {
      const detectedFramework = await detectFrameworkFromPackageJson(
        container,
        sandboxId,
      );
      if (detectedFramework) {
        scaffoldedFramework = detectedFramework;
        sandbox.scaffoldedFramework = detectedFramework;
        await saveSandboxState(sandbox);
        logger.info(
          { sandboxId, detectedFramework },
          "Auto-detected framework from package.json",
        );
      }
    }

    const requestedPackages = sandbox.requestedPackages || [];

    const nodeModulesCheck = await execCommand(
      container,
      ["test", "-d", "node_modules"],
      false,
      5000,
      undefined,
      CONTAINER_WORKDIR,
    );

    const nodeModulesMissing = nodeModulesCheck.exitCode !== 0;

    if (nodeModulesMissing) {
      const pkgJsonCheck = await execCommand(
        container,
        ["test", "-f", "package.json"],
        false,
        5000,
        undefined,
        CONTAINER_WORKDIR,
      );

      if (pkgJsonCheck.exitCode === 0) {
        logger.warn(
          { sandboxId },
          "node_modules missing before build, running pnpm install",
        );

        const installResult = await execCommand(
          container,
          ["pnpm", "install", "--frozen-lockfile=false"],
          false,
          TIMEOUT_DEPENDENCY_INSTALL_MS,
          undefined,
          CONTAINER_WORKDIR,
          ["NEXT_TELEMETRY_DISABLED=1", "CI=true"],
        );

        if (installResult.exitCode !== 0) {
          logger.error(
            {
              sandboxId,
              exitCode: installResult.exitCode,
              stderr: installResult.stderr.slice(-500),
            },
            "pnpm install failed",
          );
          await disconnectContainerFromNetwork(containerId, sandboxId);
          return {
            success: false,
            buildDirectory: null,
            error: [
              `Dependency installation failed (exit ${installResult.exitCode})`,
              "--- STDERR (tail) ---",
              (installResult.stderr || "").slice(-8000),
              "--- STDOUT (tail) ---",
              (installResult.stdout || "").slice(-8000),
            ].join("\n"),
            previewUploaded: false,
            previewUrl: null,
          };
        }
      } else {
        logger.info(
          { sandboxId },
          "No package.json found, skipping dependency installation",
        );
      }
    }

    {
      const mergeResult = await mergeAndInstallDependencies(
        containerId,
        requestedPackages,
        sandboxId,
      );
      if (!mergeResult.success) {
        await disconnectContainerFromNetwork(containerId, sandboxId);
        return {
          success: false,
          buildDirectory: null,
          error: `Dependency merge failed: ${mergeResult.error}`,
          previewUploaded: false,
          previewUrl: null,
        };
      }
    }

    const buildOptions: BuildOptions | undefined =
      userId && chatId
        ? { userId, chatId, framework: scaffoldedFramework }
        : undefined;

    const buildResult = await runUnifiedBuild(
      containerId,
      sandboxId,
      buildOptions,
    );

    if (!buildResult.success) {
      await disconnectContainerFromNetwork(containerId, sandboxId);
      return {
        success: false,
        buildDirectory: buildResult.outputInfo?.directory || null,
        error: buildResult.error,
        previewUploaded: false,
        previewUrl: null,
      };
    }

    const buildDirectory = buildResult.outputInfo!.directory;

    const DEFAULT_FRAMEWORK: Framework = "vanilla";
    const framework = (scaffoldedFramework || DEFAULT_FRAMEWORK) as Framework;
    const shouldUploadSpaFallback = framework !== DEFAULT_FRAMEWORK;
    let previewUploaded = false;
    let previewUrl: string | null = null;
    let uploadWarning: string | undefined;

    if (userId && chatId) {
      const uploadResult = await uploadBuildFilesToS3(
        sandbox,
        buildDirectory,
        framework,
      );

      if (uploadResult.successful < uploadResult.totalFiles) {
        logger.warn(
          {
            sandboxId,
            successful: uploadResult.successful,
            total: uploadResult.totalFiles,
          },
          "Some build files failed to upload to S3 (non-fatal)",
        );
      }

      const previewPrefix = buildS3Key(userId, chatId, "preview/");
      if (shouldUploadSpaFallback) {
        const fallbackKey = buildS3Key(userId, chatId, "preview/404.html");
        uploadResult.uploadedKeys.add(fallbackKey);
      }
      cleanupS3FolderExcept(previewPrefix, uploadResult.uploadedKeys).catch(
        (err) => {
          logger.warn(
            { err, sandboxId },
            "Failed to cleanup stale preview files (non-fatal)",
          );
        },
      );

      if (shouldUploadSpaFallback) {
        await uploadSpaFallback(sandbox, framework).catch((err) =>
          logger.warn({ err, sandboxId }, "SPA fallback upload failed"),
        );
      }

      await invalidatePreviewCache(userId, chatId).catch((err) =>
        logger.warn(
          { err, sandboxId },
          "CloudFront invalidation failed (non-fatal)",
        ),
      );

      previewUploaded = uploadResult.successful > 0;
      if (previewUploaded) {
        const pathPreviewUrl = buildPreviewUrl(userId, chatId);

        if (config.deployment.type === DEPLOYMENT_TYPES.SUBDOMAIN) {
          try {
            const routing = await registerPreviewSubdomain(userId, chatId);
            previewUrl = routing?.previewUrl ?? pathPreviewUrl;
            if (!previewUrl) {
              logger.warn(
                { sandboxId, userId, chatId },
                "Preview uploaded but no preview URL could be resolved",
              );
            } else if (!routing?.previewUrl) {
              logger.warn(
                { sandboxId, userId, chatId },
                "Preview uploaded but subdomain registration skipped; using path preview URL",
              );
              uploadWarning = appendWarning(
                uploadWarning,
                "Preview uploaded but subdomain routing is unavailable; using path preview URL",
              );
            }
          } catch (err) {
            logger.error(
              { err, sandboxId, userId, chatId },
              "Preview uploaded but subdomain registration failed",
            );
            previewUrl = pathPreviewUrl;
            uploadWarning = appendWarning(
              uploadWarning,
              "Preview uploaded but subdomain routing failed",
            );
          }
        } else {
          previewUrl = pathPreviewUrl;
        }
      }

      if (uploadResult.successful < uploadResult.totalFiles) {
        uploadWarning = appendWarning(
          uploadWarning,
          `Warning: ${uploadResult.totalFiles - uploadResult.successful} files failed to upload to S3`,
        );
      }
    } else {
      logger.warn(
        { sandboxId, userIdPresent: Boolean(userId), chatIdPresent: Boolean(chatId) },
        "Skipping preview upload/cleanup because sandbox is missing userId or chatId",
      );
    }

    await disconnectContainerFromNetwork(containerId, sandboxId);

    return {
      success: true,
      buildDirectory,
      previewUploaded,
      previewUrl,
      error: uploadWarning,
    };
  } catch (error) {
    await disconnectContainerFromNetwork(containerId, sandboxId).catch(
      () => { },
    );
    const err = ensureError(error);
    logger.error(
      { error: err, sandboxId },
      "Unified build/upload orchestration failed",
    );

    return {
      success: false,
      buildDirectory: null,
      error: err.message,
      previewUploaded: false,
      previewUrl: null,
    };
  }
}

async function detectFrameworkFromPackageJson(
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
