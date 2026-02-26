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
        "**/*.d.ts",
        "tests/",
        "**/*.config.ts",
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
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
      "@edward/shared": path.resolve(
        __dirname,
        "../../packages/shared/dist/index.js",
      ),
    },
  },
});
