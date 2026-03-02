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

const NEGATION_TOKEN_PATTERN = /\b(?:no|not|without|avoid|exclude|don['’]?t|dont|minus)\b/i;
const NEGATION_LOOKBACK_CHARS = 24;

function hasNegationNearMatch(input: string, matchIndex: number): boolean {
  const lookbackStart = Math.max(0, matchIndex - NEGATION_LOOKBACK_CHARS);
  const contextBeforeMatch = input.slice(lookbackStart, matchIndex);
  return NEGATION_TOKEN_PATTERN.test(contextBeforeMatch);
}

function toGlobalRegExp(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

export function detectExplicitFrameworkPreference(
  input: string | undefined,
): Framework | undefined {
  if (!input) {
    return undefined;
  }

  const detected = FRAMEWORK_MATCHERS
    .filter(({ patterns }) =>
      patterns.some((pattern) => {
        const globalPattern = toGlobalRegExp(pattern);
        for (const match of input.matchAll(globalPattern)) {
          const matchIndex = match.index;
          if (
            typeof matchIndex === "number" &&
            !hasNegationNearMatch(input, matchIndex)
          ) {
            return true;
          }
        }
        return false;
      }),
    )
    .map(({ framework }) => framework);

  if (detected.length !== 1) {
    return undefined;
  }

  return detected[0];
}
