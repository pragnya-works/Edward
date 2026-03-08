import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "scripts/",
        "**/*.d.ts",
        "tests/",
        "**/*.config.ts",
        // Integration-only adapters validated via canary/rollout checks.
        "**/services/sandbox/backup/**",
        "**/services/sandbox/builder/**",
        "**/services/sandbox/lifecycle/**",
        "**/services/sandbox/read/**",
        "**/services/sandbox/write/**",
        "**/services/sandbox/upload.service.ts",
        "**/services/sandbox/read.service.ts",
        "**/services/sandbox/backup.service.ts",
        "**/services/sandbox/docker.service.ts",
        "**/services/sandbox/types.service.ts",
        "**/services/sandbox/utils.service.ts",
        "**/services/storage/**",
        "**/services/network/**",
        "**/services/sse-utils/**",
        "**/services/builder.service.ts",
        "**/services/runs/messageOrchestrator.service.ts",
        "**/services/runs/messageOrchestrator.helpers.ts",
        "**/services/runs/retryMessageTargets.service.ts",
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
  },
  resolve: {
    alias: {
      "@edward/auth": path.resolve(
        __dirname,
        "../../packages/auth/dist/index.js",
      ),
      "@edward/shared/schema": path.resolve(
        __dirname,
        "../../packages/shared/dist/schema.js",
      ),
      "@edward/shared/streamEvents": path.resolve(
        __dirname,
        "../../packages/shared/dist/streamEvents.js",
      ),
      "@edward/shared/streamToolResults": path.resolve(
        __dirname,
        "../../packages/shared/dist/streamToolResults.js",
      ),
      "@edward/shared/llm/streamTagParser": path.resolve(
        __dirname,
        "../../packages/shared/dist/llm/streamTagParser.js",
      ),
      "@edward/shared/llm/types": path.resolve(
        __dirname,
        "../../packages/shared/dist/llm/types.js",
      ),
      "@edward/shared/constants": path.resolve(
        __dirname,
        "../../packages/shared/dist/constants.js",
      ),
      "@edward/shared/api/contracts": path.resolve(
        __dirname,
        "../../packages/shared/dist/api/contracts.js",
      ),
      "@edward/shared/github/naming": path.resolve(
        __dirname,
        "../../packages/shared/dist/github/naming.js",
      ),
      "@edward/shared": path.resolve(
        __dirname,
        "../../packages/shared/dist/index.js",
      ),
    },
  },
});
