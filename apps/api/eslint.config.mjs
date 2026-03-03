import { config } from "@edward/eslint-config/base.js";

const scriptGlobals = {
  process: "readonly",
  console: "readonly",
};

export default [
  ...(Array.isArray(config) ? config : [config]),
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: scriptGlobals,
    },
  },
];
