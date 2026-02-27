import type { GithubFile } from "@edward/octokit";
import {
  AUTO_GENERATED_README_MARKER_PATTERN,
  BASE64_ENCODING,
  DEFAULT_BOILERPLATE_PATTERNS,
  INDEX_HTML_PATH,
  INSTALL_COMMAND_BY_PACKAGE_MANAGER,
  LOCKFILE_BY_PACKAGE_MANAGER,
  MAX_DEP_LIST_ITEMS,
  PACKAGE_JSON_PATH,
  PACKAGE_MANAGER,
  SCRIPT_NAME,
  TAILWIND_PATH_PATTERN,
  TYPESCRIPT_FILE_PATTERN,
  type PackageManager,
  type ScriptName,
} from "./readme.constants.js";

interface PackageJsonShape {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: {
    node?: string;
  };
}

const CONTENT_DECODER_BY_ENCODING: Record<string, (content: string) => string> = {
  [BASE64_ENCODING]: (content) => Buffer.from(content, BASE64_ENCODING).toString("utf8"),
};

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DEFAULT_BOILERPLATE_REGEXES = DEFAULT_BOILERPLATE_PATTERNS.map(
  (pattern) => new RegExp(escapeForRegex(pattern)),
);

export interface PrepareGithubFilesOptions {
  repoName?: string;
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

export function getUtf8Content(file: GithubFile): string {
  const encoding = file.encoding ?? "";
  return CONTENT_DECODER_BY_ENCODING[encoding]?.(file.content) ?? file.content;
}

export function parsePackageJson(files: GithubFile[]): PackageJsonShape | null {
  const fileByPath = new Map(
    files.map((file) => [normalizePath(file.path), file] as const),
  );
  const pkgFile = fileByPath.get(PACKAGE_JSON_PATH);
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

  const normalizedPaths = new Set(files.map((file) => normalizePath(file.path)));
  const rootHtml = normalizedPaths.has(INDEX_HTML_PATH);
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

function detectPackageManager(files: GithubFile[]): PackageManager {
  const normalizedPaths = new Set(files.map((file) => normalizePath(file.path)));
  if (normalizedPaths.has(LOCKFILE_BY_PACKAGE_MANAGER[PACKAGE_MANAGER.PNPM])) {
    return PACKAGE_MANAGER.PNPM;
  }
  if (normalizedPaths.has(LOCKFILE_BY_PACKAGE_MANAGER[PACKAGE_MANAGER.YARN])) {
    return PACKAGE_MANAGER.YARN;
  }
  return PACKAGE_MANAGER.NPM;
}

const SCRIPT_COMMAND_FORMATTER_BY_PACKAGE_MANAGER: Record<
  PackageManager,
  (script: string) => string
> = {
  [PACKAGE_MANAGER.PNPM]: (script) => `pnpm ${script}`,
  [PACKAGE_MANAGER.YARN]: (script) => `yarn ${script}`,
  [PACKAGE_MANAGER.NPM]: (script) => `npm run ${script}`,
};

function formatScriptCommand(packageManager: PackageManager, script: string): string {
  return SCRIPT_COMMAND_FORMATTER_BY_PACKAGE_MANAGER[packageManager](script);
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
  const usesTypeScript = paths.some((path) => TYPESCRIPT_FILE_PATTERN.test(path));
  const hasTailwind =
    paths.some((path) => TAILWIND_PATH_PATTERN.test(path)) ||
    Boolean(deps.tailwindcss);
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
  const preferredSet = new Set(preferred);

  const ordered = preferred.filter((item) => roots.has(item));
  const additional = Array.from(roots)
    .filter((item) => !preferredSet.has(item))
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
  packageManager: PackageManager,
): string[] {
  const scripts = packageJson?.scripts ?? {};
  const priority: ScriptName[] = [
    SCRIPT_NAME.DEV,
    SCRIPT_NAME.BUILD,
    SCRIPT_NAME.START,
    SCRIPT_NAME.LINT,
    SCRIPT_NAME.TEST,
  ];
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

export function buildReadmeContent(
  files: GithubFile[],
  packageJson: PackageJsonShape | null,
  options: PrepareGithubFilesOptions,
): string {
  const projectName = resolveProjectName(files, packageJson, options);
  const framework = detectFramework(files, packageJson);
  const packageManager = detectPackageManager(files);
  const highlights = buildHighlights(files, packageJson, framework);
  const scripts = buildScriptList(packageJson, packageManager);
  const availableScriptNames = new Set(Object.keys(packageJson?.scripts ?? {}));
  const topLevelPaths = detectTopLevelPaths(files);
  const keyDependencies = collectKeyDependencies(packageJson);
  const nodeVersion = packageJson?.engines?.node?.trim() || "20+";

  const installCommand = INSTALL_COMMAND_BY_PACKAGE_MANAGER[packageManager];
  const devCommand = availableScriptNames.has(SCRIPT_NAME.DEV)
    ? formatScriptCommand(packageManager, SCRIPT_NAME.DEV)
    : null;
  const buildCommand = availableScriptNames.has(SCRIPT_NAME.BUILD)
    ? formatScriptCommand(packageManager, SCRIPT_NAME.BUILD)
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
    `- Language: ${
      files.some((file) => TYPESCRIPT_FILE_PATTERN.test(normalizePath(file.path)))
        ? "TypeScript"
        : "JavaScript"
    }`,
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
  return DEFAULT_BOILERPLATE_REGEXES.some((pattern) => pattern.test(lower));
}

export function shouldUpgradeExistingReadme(content: string): boolean {
  const lower = content.toLowerCase();
  if (looksLikeDefaultBoilerplate(content)) return true;
  if (AUTO_GENERATED_README_MARKER_PATTERN.test(lower)) {
    return true;
  }
  if (content.trim().length < 140) return true;
  return false;
}
