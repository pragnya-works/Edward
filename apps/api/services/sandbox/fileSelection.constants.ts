export const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 500;
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_NON_PRIORITY_FILES = 2_000;
export const MAX_NON_PRIORITY_BYTES = 20 * 1024 * 1024;
export const MAX_SNAPSHOT_CACHE_ENTRIES = 500;

export const SANDBOX_EXCLUDED_DIRS = [
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  ".git",
  ".cache",
  "coverage",
  ".turbo",
  ".vercel",
] as const;

export const SNAPSHOT_EXTRA_EXCLUDED_DIRS = [
  ".output",
  "preview",
  "previews",
] as const;

export const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".css",
  ".scss",
  ".html",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
  ".env",
  ".mjs",
  ".cjs",
  ".svg",
  ".txt",
]);

export const PRIORITY_FILES = [
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/globals.css",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.css",
  "src/components/ui.tsx",
  "src/components/providers.tsx",
  "src/components/theme-toggle.tsx",
  "src/components/themeToggle.tsx",
  "src/lib/utils.ts",
  "components.json",
  "next.config.mjs",
  "vite.config.ts",
  "tailwind.config.ts",
  "tailwind.config.js",
  "postcss.config.mjs",
  "postcss.config.js",
  "tsconfig.json",
  "package.json",
  "index.html",
  "styles.css",
  "script.js",
] as const;

export const PRIORITY_FILE_SET: ReadonlySet<string> = new Set(PRIORITY_FILES);
