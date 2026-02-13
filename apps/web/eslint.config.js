import { nextJsConfig } from "@edward/eslint-config/next-js";

/** @type {import("eslint").Linter.Config} */
export default [
  ...nextJsConfig,
  {
    ignores: ["next.config.mjs"],
  },
];
