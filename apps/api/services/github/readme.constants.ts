export const ROOT_README_PATH = "README.md";
export const MAX_DEP_LIST_ITEMS = 8;
export const BASE64_ENCODING = "base64";
export const PACKAGE_JSON_PATH = "package.json";
export const INDEX_HTML_PATH = "index.html";
export const AUTO_GENERATED_README_MARKER_PATTERN =
  /readme prepared by edward github sync enrichment/;

export const PACKAGE_MANAGER = {
  PNPM: "pnpm",
  YARN: "yarn",
  NPM: "npm",
} as const;

export type PackageManager =
  (typeof PACKAGE_MANAGER)[keyof typeof PACKAGE_MANAGER];

export const LOCKFILE_BY_PACKAGE_MANAGER: Record<PackageManager, string> = {
  [PACKAGE_MANAGER.PNPM]: "pnpm-lock.yaml",
  [PACKAGE_MANAGER.YARN]: "yarn.lock",
  [PACKAGE_MANAGER.NPM]: "package-lock.json",
};

export const INSTALL_COMMAND_BY_PACKAGE_MANAGER: Record<PackageManager, string> = {
  [PACKAGE_MANAGER.PNPM]: "pnpm install",
  [PACKAGE_MANAGER.YARN]: "yarn install",
  [PACKAGE_MANAGER.NPM]: "npm install",
};

export const SCRIPT_NAME = {
  DEV: "dev",
  BUILD: "build",
  START: "start",
  LINT: "lint",
  TEST: "test",
} as const;

export type ScriptName = (typeof SCRIPT_NAME)[keyof typeof SCRIPT_NAME];

export const TYPESCRIPT_FILE_PATTERN = /\.(ts|tsx)$/;
export const TAILWIND_PATH_PATTERN = /tailwind/;
export const DEV_SCRIPT_MARKER_PATTERN = /\sdev`/;
export const BUILD_SCRIPT_MARKER_PATTERN = /\sbuild`/;

export const DEFAULT_BOILERPLATE_PATTERNS = [
  "this is a [next.js](https://nextjs.org) project bootstrapped with",
  "you can start editing the page by modifying",
  "this template provides a minimal setup to get react working in vite",
  "# vite + react",
  "learn more about next.js",
  "deploy on vercel",
];
