import type { GithubFile } from "@edward/octokit";
import {
  MAX_DEP_LIST_ITEMS,
  PACKAGE_MANAGER,
  SCRIPT_NAME,
  type PackageManager,
  type ScriptName,
} from "./readme.constants.js";

interface PackageJsonShapeLike {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

const SCRIPT_COMMAND_FORMATTER_BY_PACKAGE_MANAGER: Record<
  PackageManager,
  (script: string) => string
> = {
  [PACKAGE_MANAGER.PNPM]: (script) => `pnpm ${script}`,
  [PACKAGE_MANAGER.YARN]: (script) => `yarn ${script}`,
  [PACKAGE_MANAGER.NPM]: (script) => `npm run ${script}`,
};

export function formatScriptCommand(packageManager: PackageManager, script: string): string {
  return SCRIPT_COMMAND_FORMATTER_BY_PACKAGE_MANAGER[packageManager](script);
}

export function detectTopLevelPaths(files: GithubFile[]): string[] {
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

export function collectKeyDependencies(packageJson: PackageJsonShapeLike | null): string[] {
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

export function buildScriptList(
  packageJson: PackageJsonShapeLike | null,
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

export function buildStructureSnippet(topLevelPaths: string[]): string {
  if (topLevelPaths.length === 0) {
    return "```text\n.\n```";
  }

  return ["```text", ".", ...topLevelPaths.map((item) => `|-- ${item}`), "```"].join(
    "\n",
  );
}
