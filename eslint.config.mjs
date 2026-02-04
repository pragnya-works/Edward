import { config } from "@edward/eslint-config/base.js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ["apps/**", "packages/**"],
  },
];
