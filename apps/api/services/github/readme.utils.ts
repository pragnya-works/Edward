import type { GithubFile } from "@edward/octokit";

interface PackageJsonShape {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: {
    node?: string;
  };
}

export type ReadmeSyncAction = "kept" | "created" | "upgraded";

export interface PrepareGithubFilesResult {
  files: GithubFile[];
  readmeAction: ReadmeSyncAction;
}

interface PrepareGithubFilesOptions {
  repoName?: string;
}

const ROOT_README_PATH = "README.md";
const MAX_DEP_LIST_ITEMS = 8;

const DEFAULT_BOILERPLATE_PATTERNS = [
  "this is a [next.js](https://nextjs.org) project bootstrapped with",
  "you can start editing the page by modifying",
  "this template provides a minimal setup to get react working in vite",
  "# vite + react",
  "learn more about next.js",
  "deploy on vercel",
];

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

function getUtf8Content(file: GithubFile): string {
  if (file.encoding === "base64") {
    return Buffer.from(file.content, "base64").toString("utf8");
  }
  return file.content;
}

function parsePackageJson(files: GithubFile[]): PackageJsonShape | null {
  const pkgFile = files.find((file) => normalizePath(file.path) === "package.json");
  if (!pkgFile) return null;

  try {
    const raw = getUtf8Content(pkgFile);
    return JSON.parse(raw) as PackageJsonShape;
  } catch {
    return null;
  }
}

function toTitleCase(input: string): string {
  return input
    .replace(/^@[^/]+\//, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveProjectName(
  files: GithubFile[],
  packageJson: PackageJsonShape | null,
  options: PrepareGithubFilesOptions,
): string {
  const pkgName = packageJson?.name?.trim();
  if (pkgName) return toTitleCase(pkgName);

  const repoName = options.repoName?.trim();
  if (repoName) return toTitleCase(repoName);

  const rootHtml = files.some((file) => normalizePath(file.path) === "index.html");
  if (rootHtml) return "Web App";

  return "Frontend App";
}

function detectFramework(files: GithubFile[], packageJson: PackageJsonShape | null): string {
  const normalizedPaths = new Set(files.map((file) => normalizePath(file.path)));
  const deps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };

  if (
    normalizedPaths.has("next.config.js") ||
    normalizedPaths.has("next.config.mjs") ||
    normalizedPaths.has("next.config.ts") ||
    normalizedPaths.has("src/app/layout.tsx") ||
    normalizedPaths.has("src/app/page.tsx") ||
    Boolean(deps.next)
  ) {
    return "Next.js";
  }

  if (
    normalizedPaths.has("vite.config.ts") ||
    normalizedPaths.has("vite.config.js") ||
    normalizedPaths.has("src/main.tsx") ||
    normalizedPaths.has("src/main.jsx") ||
    Boolean(deps.vite)
  ) {
    return "Vite + React";
  }

  if (normalizedPaths.has("index.html")) {
    return "Vanilla HTML/CSS/JS";
  }

  if (deps.react) {
    return "React";
  }

  return "Frontend Web";
}

function detectPackageManager(files: GithubFile[]): "pnpm" | "yarn" | "npm" {
  const normalizedPaths = new Set(files.map((file) => normalizePath(file.path)));
  if (normalizedPaths.has("pnpm-lock.yaml")) return "pnpm";
  if (normalizedPaths.has("yarn.lock")) return "yarn";
  return "npm";
}

function formatScriptCommand(packageManager: "pnpm" | "yarn" | "npm", script: string): string {
  if (packageManager === "pnpm") return `pnpm ${script}`;
  if (packageManager === "yarn") return `yarn ${script}`;
  return `npm run ${script}`;
}

function countByPathPattern(files: GithubFile[], pattern: RegExp): number {
  return files.filter((file) => pattern.test(normalizePath(file.path))).length;
}

function buildHighlights(
  files: GithubFile[],
  packageJson: PackageJsonShape | null,
  framework: string,
): string[] {
  const paths = files.map((file) => normalizePath(file.path));
  const deps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };

  const routeCount =
    countByPathPattern(files, /^src\/app(?:\/.*)?\/page\.(tsx|jsx|ts|js)$/) +
    countByPathPattern(files, /^src\/pages\/.*\.(tsx|jsx|ts|js)$/);
  const componentCount = countByPathPattern(
    files,
    /^src\/components\/.*\.(tsx|jsx|ts|js)$/,
  );
  const usesTypeScript = paths.some((path) => path.endsWith(".ts") || path.endsWith(".tsx"));
  const hasTailwind =
    paths.some((path) => path.includes("tailwind")) || Boolean(deps.tailwindcss);
  const hasState =
    Boolean(deps.zustand) ||
    Boolean(deps["@reduxjs/toolkit"]) ||
    Boolean(deps.recoil);
  const hasQuery = Boolean(deps["@tanstack/react-query"]) || Boolean(deps.swr);

  const highlights: string[] = [
    `Built with ${framework} and organized for iterative product development.`,
  ];

  if (routeCount > 0) {
    highlights.push(`Includes ${routeCount} route/page file${routeCount === 1 ? "" : "s"} for user flows.`);
  }

  if (componentCount > 0) {
    highlights.push(
      `Contains ${componentCount} reusable component file${componentCount === 1 ? "" : "s"} under \`src/components\`.`,
    );
  }

  if (usesTypeScript) {
    highlights.push("TypeScript-first implementation for safer refactors and maintainability.");
  }

  if (hasTailwind) {
    highlights.push("Utility-first styling pipeline with Tailwind CSS.");
  }

  if (hasState) {
    highlights.push("Client state management is wired for scalable UI behavior.");
  }

  if (hasQuery) {
    highlights.push("Data fetching/caching patterns are supported with query tooling.");
  }

  return highlights.slice(0, 5);
}

function detectTopLevelPaths(files: GithubFile[]): string[] {
  const roots = new Set<string>();
  for (const file of files) {
    const normalized = normalizePath(file.path);
    const [root] = normalized.split("/");
    if (root) roots.add(root);
  }

  const preferred = [
    "src",
    "public",
    "app",
    "components",
    "styles",
    "assets",
    "package.json",
    "README.md",
  ];

  const ordered = preferred.filter((item) => roots.has(item));
  const additional = Array.from(roots)
    .filter((item) => !preferred.includes(item))
    .sort();

  return [...ordered, ...additional].slice(0, 10);
}

function collectKeyDependencies(packageJson: PackageJsonShape | null): string[] {
  const deps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };

  const preferred = [
    "react",
    "next",
    "vite",
    "typescript",
    "tailwindcss",
    "@tanstack/react-query",
    "zustand",
    "framer-motion",
    "motion",
    "lucide-react",
    "zod",
  ];

  const listed = preferred.filter((name) => Boolean(deps[name]));
  if (listed.length > 0) {
    return listed.slice(0, MAX_DEP_LIST_ITEMS);
  }

  return Object.keys(deps).slice(0, MAX_DEP_LIST_ITEMS);
}

function buildScriptList(
  packageJson: PackageJsonShape | null,
  packageManager: "pnpm" | "yarn" | "npm",
): string[] {
  const scripts = packageJson?.scripts ?? {};
  const priority = ["dev", "build", "start", "lint", "test"];
  const scriptNames = priority.filter((name) => Boolean(scripts[name]));

  if (scriptNames.length === 0) return [];

  return scriptNames.map(
    (name) => `- \`${formatScriptCommand(packageManager, name)}\` - runs \`${name}\``,
  );
}

function buildStructureSnippet(topLevelPaths: string[]): string {
  if (topLevelPaths.length === 0) {
    return "```text\n.\n```";
  }

  return ["```text", ".", ...topLevelPaths.map((item) => `|-- ${item}`), "```"].join(
    "\n",
  );
}

function buildReadmeContent(
  files: GithubFile[],
  packageJson: PackageJsonShape | null,
  options: PrepareGithubFilesOptions,
): string {
  const projectName = resolveProjectName(files, packageJson, options);
  const framework = detectFramework(files, packageJson);
  const packageManager = detectPackageManager(files);
  const highlights = buildHighlights(files, packageJson, framework);
  const scripts = buildScriptList(packageJson, packageManager);
  const topLevelPaths = detectTopLevelPaths(files);
  const keyDependencies = collectKeyDependencies(packageJson);
  const nodeVersion = packageJson?.engines?.node?.trim() || "20+";

  const installCommand =
    packageManager === "pnpm"
      ? "pnpm install"
      : packageManager === "yarn"
        ? "yarn install"
        : "npm install";
  const devCommand = scripts.find((line) => line.includes(" dev`"))
    ? formatScriptCommand(packageManager, "dev")
    : null;
  const buildCommand = scripts.find((line) => line.includes(" build`"))
    ? formatScriptCommand(packageManager, "build")
    : null;

  const lines: string[] = [
    `# ${projectName}`,
    "",
    `${projectName} is a ${framework} application scaffolded and iterated with Edward.`,
    "It is structured for fast feature delivery, reliable local development, and clean handoff to GitHub.",
    "",
    "## Highlights",
    ...highlights.map((item) => `- ${item}`),
    "",
    "## Tech Stack",
    `- Framework: ${framework}`,
    `- Language: ${files.some((file) => /\.(ts|tsx)$/.test(normalizePath(file.path))) ? "TypeScript" : "JavaScript"}`,
    `- Package manager: ${packageManager}`,
    ...(keyDependencies.length > 0
      ? [`- Notable dependencies: ${keyDependencies.map((dep) => `\`${dep}\``).join(", ")}`]
      : []),
    "",
    "## Project Structure",
    buildStructureSnippet(topLevelPaths),
    "",
    "## Getting Started",
    `1. Ensure Node.js ${nodeVersion} is installed.`,
    `2. Install dependencies: \`${installCommand}\``,
    ...(devCommand ? [`3. Start development server: \`${devCommand}\``] : []),
    ...(buildCommand ? [`4. Build for production: \`${buildCommand}\``] : []),
    "",
    "## Available Scripts",
    ...(scripts.length > 0
      ? scripts
      : ["- No package scripts were detected. Add scripts to `package.json` as needed."]),
    "",
    "## Notes",
    "- If this project uses environment variables, create an `.env` file based on your local requirements.",
    "- Review dependencies and scripts before deploying to production.",
    "",
    "_README prepared by Edward GitHub sync enrichment._",
    "",
  ];

  return lines.join("\n");
}

function looksLikeDefaultBoilerplate(content: string): boolean {
  const lower = content.toLowerCase();
  return DEFAULT_BOILERPLATE_PATTERNS.some((pattern) => lower.includes(pattern));
}

function shouldUpgradeExistingReadme(content: string): boolean {
  const lower = content.toLowerCase();
  if (looksLikeDefaultBoilerplate(content)) return true;
  if (lower.includes("readme prepared by edward github sync enrichment")) {
    return true;
  }
  if (content.trim().length < 140) return true;
  return false;
}

export function prepareGithubFilesWithReadme(
  files: GithubFile[],
  options: PrepareGithubFilesOptions = {},
): PrepareGithubFilesResult {
  const dedupedByPath = new Map<string, GithubFile>();
  for (const file of files) {
    const normalized = normalizePath(file.path);
    dedupedByPath.set(normalized, { ...file, path: normalized });
  }

  const packageJson = parsePackageJson(Array.from(dedupedByPath.values()));
  const existingReadme = dedupedByPath.get(ROOT_README_PATH);
  const generatedReadme = buildReadmeContent(
    Array.from(dedupedByPath.values()),
    packageJson,
    options,
  );

  if (!existingReadme) {
    dedupedByPath.set(ROOT_README_PATH, {
      path: ROOT_README_PATH,
      content: generatedReadme,
      encoding: "utf-8",
    });
    return { files: Array.from(dedupedByPath.values()), readmeAction: "created" };
  }

  const existingContent = getUtf8Content(existingReadme);
  if (!shouldUpgradeExistingReadme(existingContent)) {
    return { files: Array.from(dedupedByPath.values()), readmeAction: "kept" };
  }

  dedupedByPath.set(ROOT_README_PATH, {
    path: ROOT_README_PATH,
    content: generatedReadme,
    encoding: "utf-8",
  });

  return { files: Array.from(dedupedByPath.values()), readmeAction: "upgraded" };
}
