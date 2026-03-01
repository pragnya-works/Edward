import type { Framework } from "./schemas.js";

const FRAMEWORK_MATCHERS: ReadonlyArray<{
  framework: Framework;
  patterns: ReadonlyArray<RegExp>;
}> = [
  {
    framework: "nextjs",
    patterns: [
      /\bnext(?:\.js|js)\b/i,
      /\bnext\s+js\b/i,
    ],
  },
  {
    framework: "vite-react",
    patterns: [
      /\bvite(?:\s+react)?\b/i,
    ],
  },
  {
    framework: "vanilla",
    patterns: [
      /\bvanilla(?:\s+(?:js|javascript|html|css))?\b/i,
      /\bplain\s+(?:html|javascript|js)\b/i,
      /\bhtml\s*\/\s*css\s*\/\s*js\b/i,
    ],
  },
];

export function detectExplicitFrameworkPreference(
  input: string | undefined,
): Framework | undefined {
  if (!input) {
    return undefined;
  }

  const detected = FRAMEWORK_MATCHERS
    .filter(({ patterns }) => patterns.some((pattern) => pattern.test(input)))
    .map(({ framework }) => framework);

  if (detected.length !== 1) {
    return undefined;
  }

  return detected[0];
}
