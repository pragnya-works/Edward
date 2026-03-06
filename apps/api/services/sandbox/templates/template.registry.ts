import { config } from "../../../app.config.js";

export interface TemplateConfig {
  snapshotId?: string;
  templateDir: string;
  outputDir: string;
  protectedFiles: string[];
}

const SNAPSHOTS = config.vercel.snapshots;

export const TEMPLATE_REGISTRY: Record<string, TemplateConfig> = {
  nextjs: {
    snapshotId: SNAPSHOTS.nextjs,
    templateDir: "nextjs",
    outputDir: "out",
    protectedFiles: [
      "package.json",
      "tsconfig.json",
      "next.config.ts",
      "next.config.mjs",
      "next.config.js",
      "tailwind.config.ts",
      "tailwind.config.js",
      "postcss.config.mjs",
      "postcss.config.js",
      "eslint.config.mjs",
      ".eslintrc.json",
      "next-env.d.ts",
      "globals.css",
      "src/app/globals.css",
    ],
  },
  "vite-react": {
    snapshotId: SNAPSHOTS.viteReact,
    templateDir: "vite-react",
    outputDir: "dist",
    protectedFiles: [
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "vite.config.js",
      "tsconfig.app.json",
      "tsconfig.node.json",
      "index.css",
      "src/index.css",
      "index.html",
    ],
  },
  vanilla: {
    snapshotId: SNAPSHOTS.vanilla,
    templateDir: "vanilla",
    outputDir: ".",
    protectedFiles: [],
  },
};

export function isValidFramework(framework: string): boolean {
  const normalized = framework.toLowerCase();
  const validFrameworks = [
    "nextjs",
    "vite-react",
    "vanilla",
    "next",
    "react",
    "vite",
    "next.js",
  ];
  return validFrameworks.includes(normalized);
}

export function normalizeFramework(
  framework: string,
): "nextjs" | "vite-react" | "vanilla" | undefined {
  const normalized = framework.toLowerCase();
  if (
    normalized === "next" ||
    normalized === "next.js" ||
    normalized === "nextjs"
  )
    return "nextjs";
  if (
    normalized === "react" ||
    normalized === "vite" ||
    normalized === "vite-react"
  )
    return "vite-react";
  if (normalized === "vanilla") return "vanilla";
  return undefined;
}

export function getTemplateConfig(
  framework: string,
): TemplateConfig | undefined {
  const normalized = normalizeFramework(framework);
  return normalized ? TEMPLATE_REGISTRY[normalized] : undefined;
}

export function getDefaultSnapshotId(): string | undefined {
  return TEMPLATE_REGISTRY.vanilla?.snapshotId;
}
