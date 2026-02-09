import {
  getContainer,
  execCommand,
  CONTAINER_WORKDIR,
} from "../docker.sandbox.js";
import { logger } from "../../../utils/logger.js";
import { sanitizePathComponent } from "../../storage/key.utils.js";
import { Framework } from "../../planning/schemas.js";
import { config as appConfig } from "../../../config.js";

export type DeploymentType = "path" | "subdomain";

export interface BasePathConfig {
  userId: string;
  chatId: string;
  framework: Framework;
  deploymentType?: DeploymentType;
}

export interface RuntimeConfig {
  basePath: string;
  assetPrefix: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

type TailwindVersion = "v4" | "v3" | "none";

const DEFAULT_DEPLOYMENT_TYPE: DeploymentType = "path";

export function detectDeploymentType(config: BasePathConfig): DeploymentType {
  if (config.deploymentType) {
    return config.deploymentType;
  }
  return appConfig.deployment.type;
}

export function calculateBasePath(
  userId: string,
  chatId: string,
  deploymentType: DeploymentType = DEFAULT_DEPLOYMENT_TYPE,
): string {
  if (deploymentType === "subdomain") {
    return "";
  }

  const safeUserId = sanitizePathComponent(userId);
  const safeChatId = sanitizePathComponent(chatId);
  return `/${safeUserId}/${safeChatId}/preview`;
}

export function generateRuntimeConfig(config: BasePathConfig): RuntimeConfig {
  const deploymentType = detectDeploymentType(config);
  const basePath = calculateBasePath(
    config.userId,
    config.chatId,
    deploymentType,
  );

  return {
    basePath,
    assetPrefix: basePath ? `${basePath}/` : "",
  };
}

export function generateNextConfig(runtimeConfig: RuntimeConfig): string {
  const basePathValue = runtimeConfig.basePath || "";
  const assetPrefixValue = runtimeConfig.assetPrefix || "";

  const configLines: string[] = [`  output: 'export',`];

  if (basePathValue) {
    configLines.push(`  basePath: '${basePathValue}',`);
    if (assetPrefixValue) {
      configLines.push(`  assetPrefix: '${assetPrefixValue}',`);
    }
  }

  configLines.push(
    `  trailingSlash: true,`,
    `  images: {`,
    `    unoptimized: true,`,
    `  },`,
    `  typescript: {`,
    `    ignoreBuildErrors: true,`,
    `  },`,
    `  eslint: {`,
    `    ignoreDuringBuilds: true,`,
    `  },`,
  );

  return `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
${configLines.join("\n")}
};

export default nextConfig;
`;
}

export function generateViteConfig(runtimeConfig: RuntimeConfig): string {
  const baseValue = runtimeConfig.basePath
    ? `'${runtimeConfig.assetPrefix}'`
    : `'/'`;

  return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: ${baseValue},
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        manualChunks: undefined,
      },
    },
  },
})
`;
}

async function writeFileToContainer(
  containerId: string,
  filePath: string,
  content: string,
  sandboxId: string,
): Promise<void> {
  const container = getContainer(containerId);
  const fullPath = `${CONTAINER_WORKDIR}/${filePath}`;

  try {
    const base64Content = Buffer.from(content).toString("base64");
    const result = await execCommand(
      container,
      ["sh", "-c", `echo '${base64Content}' | base64 -d > '${fullPath}'`],
      false,
      30000,
      undefined,
      CONTAINER_WORKDIR,
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.stderr}`);
    }

    logger.debug(
      { sandboxId, filePath },
      "Configuration file written successfully",
    );
  } catch (error) {
    logger.error(
      { error, sandboxId, filePath },
      "Failed to write configuration file",
    );
    throw error;
  }
}

async function readPackageJson(
  containerId: string,
  sandboxId: string,
): Promise<PackageJson | null> {
  const container = getContainer(containerId);

  try {
    const result = await execCommand(
      container,
      ["cat", "package.json"],
      false,
      5000,
      undefined,
      CONTAINER_WORKDIR,
    );

    if (result.exitCode !== 0) {
      logger.debug({ sandboxId }, "No package.json found");
      return null;
    }

    return JSON.parse(result.stdout) as PackageJson;
  } catch (error) {
    logger.warn({ sandboxId, error }, "Failed to read or parse package.json");
    return null;
  }
}

function hasDependency(packageJson: PackageJson | null, dep: string): boolean {
  if (!packageJson) return false;
  return Boolean(
    packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep],
  );
}

function detectTailwindVersion(
  packageJson: PackageJson | null,
): TailwindVersion {
  if (hasDependency(packageJson, "@tailwindcss/postcss")) {
    return "v4";
  }
  if (hasDependency(packageJson, "tailwindcss")) {
    return "v3";
  }
  return "none";
}

export async function injectBasePathConfigs(
  containerId: string,
  config: BasePathConfig,
  sandboxId: string,
): Promise<void> {
  const runtimeConfig = generateRuntimeConfig(config);

  try {
    switch (config.framework) {
      case "nextjs": {
        const container = getContainer(containerId);
        await execCommand(
          container,
          ["rm", "-f", "next.config.js", "next.config.mjs"],
          false,
          5000,
          undefined,
          CONTAINER_WORKDIR,
        ).catch((err) =>
          logger.warn(
            { sandboxId, err },
            "Failed to delete conflicting next.config files",
          ),
        );

        const packageJson = await readPackageJson(containerId, sandboxId);
        const tailwindVersion = detectTailwindVersion(packageJson);

        if (tailwindVersion === "v4") {
          const postcssConfig = `export default {\n  plugins: {\n    '@tailwindcss/postcss': {},\n  },\n};\n`;
          await writeFileToContainer(
            containerId,
            "postcss.config.mjs",
            postcssConfig,
            sandboxId,
          );
          logger.debug(
            { sandboxId },
            "Injected Tailwind CSS v4 PostCSS config",
          );
        } else if (tailwindVersion === "v3") {
          const postcssConfig = `export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`;
          await writeFileToContainer(
            containerId,
            "postcss.config.mjs",
            postcssConfig,
            sandboxId,
          );
          logger.debug(
            { sandboxId },
            "Injected Tailwind CSS v3 PostCSS config",
          );
        } else {
          logger.debug(
            { sandboxId },
            "No Tailwind CSS detected, skipping PostCSS config injection",
          );
        }

        const nextConfig = generateNextConfig(runtimeConfig);
        await writeFileToContainer(
          containerId,
          "next.config.ts",
          nextConfig,
          sandboxId,
        );

        const eslintConfig = `// ESLint disabled for sandbox builds\nexport default [];\n`;
        await writeFileToContainer(
          containerId,
          "eslint.config.mjs",
          eslintConfig,
          sandboxId,
        );
        break;
      }
      case "vite-react": {
        const viteConfig = generateViteConfig(runtimeConfig);
        await writeFileToContainer(
          containerId,
          "vite.config.ts",
          viteConfig,
          sandboxId,
        );
        break;
      }
      case "vanilla":
        break;
      default:
        logger.warn(
          { sandboxId, framework: config.framework },
          "Unknown framework, skipping config injection",
        );
    }
  } catch (error) {
    logger.error(
      { error, sandboxId },
      "Failed to inject base path configurations",
    );
    throw error;
  }
}