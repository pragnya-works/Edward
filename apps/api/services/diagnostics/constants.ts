import type {
  BuildStage,
  ErrorPattern,
  ModuleErrorPattern,
  TsErrorInfo,
} from "./types.js";

export const STRIP_ANSI = new RegExp(
  String.raw`[\x1b\x9b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]`,
  "g"
);

export const ERROR_PATTERNS: ErrorPattern[] = [
  {
    name: "typescript",
    regex:
      /([\w/.\\\\ @-]+\.(?:ts|tsx))[:(](\d+)[:;,](\d+)?\)?\s*(?:-?\s*error)?\s*(TS\d+)?:?\s*([^\n]+)/gi,
    stage: "typecheck",
  },
  {
    name: "vite_esbuild",
    regex:
      /✓?\s*(?:[\d.]+\s*)?([\w/.\\\\ @-]+\.(?:ts|tsx|js|jsx)):(\d+):(\d+):\s*(error|ERROR|warning)?:?\s*([^\n]+)/gi,
    stage: "transform",
  },
  {
    name: "webpack",
    regex:
      /(?:ERROR|Error)\s+in\s+([\w/.\\\\ @-]+\.(?:ts|tsx|js|jsx))\s*\n?([^:]+):(\d+):(\d+)?/gi,
    stage: "bundle",
  },
  {
    name: "rollup",
    regex:
      /[!✖]\s+([\w/.\\\\ @-]+\.(?:ts|tsx|js|jsx))\s*\((\d+):(\d+)\)\s*([^\n]+)/gi,
    stage: "bundle",
  },
  {
    name: "nextjs",
    regex:
      /(?:>\s*)?([\w/.\\\\ @-]+\.(?:ts|tsx|js|jsx)):(\d+):?(\d+)?\s*\n?\s*│?\s*([^\n]+)/gi,
    stage: "compile",
  },
  {
    name: "stack_trace",
    regex:
      /at\s+(?:\w+\s+)?\(?(?:file:\/\/)?([\w/.\\\\ @-]+\.(?:ts|tsx|js|jsx)):(\d+):(\d+)\)?/gi,
    stage: "runtime",
  },
];

export const MODULE_ERROR_PATTERNS: ModuleErrorPattern[] = [
  {
    regex:
      /cannot\s+find\s+(?:module|package)\s+['"]([^'"]+)['"]|module\s+not\s+found.*?['"]([^'"]+)['"]|failed\s+to\s+resolve\s+.*?['"]([^'"]+)['"]/gi,
    type: "missing_import",
  },
  {
    regex:
      /(?:unexpected\s+token|syntax|parse)\s+error|unexpected\s+identifier|unterminated/gi,
    type: "syntax",
  },
  {
    regex:
      /is\s+not\s+assignable\s+to|does\s+not\s+exist\s+on\s+type|cannot\s+find\s+name/gi,
    type: "type_mismatch",
  },
  {
    regex: /(heap\s+out\s+of\s+memory|memory\s+allocation|max\s+old\s+space)/gi,
    type: "resource",
    severity: "critical",
  },
  {
    regex:
      /(command\s+not\s+found|not\s+found:?)\s*(?:node|npm|pnpm|yarn|npx)?/gi,
    type: "environment",
    severity: "critical",
  },
  {
    regex: /(eacces|permission\s+denied|operation\s+not\s+permitted)/gi,
    type: "environment",
  },
  {
    regex: /(econnrefused|etimedout|enotfound|network\s+error)/gi,
    type: "network",
  },
  {
    regex: /(enospc|no\s+space\s+left)/gi,
    type: "resource",
    severity: "critical",
  },
  {
    regex: /(config|configuration|plugin|loader|webpack)/gi,
    type: "config",
  },
  {
    regex: /(referenceerror|typeerror|runtime)/gi,
    type: "runtime",
  },
];

export const TS_ERROR_MAP: Record<string, TsErrorInfo> = {
  TS2307: {
    type: "missing_import",
    severity: "error",
    description: "Cannot find module",
  },
  TS2304: {
    type: "type_mismatch",
    severity: "error",
    description: "Cannot find name",
  },
  TS2322: {
    type: "type_mismatch",
    severity: "error",
    description: "Type not assignable",
  },
  TS2345: {
    type: "type_mismatch",
    severity: "error",
    description: "Argument type mismatch",
  },
  TS2554: {
    type: "type_mismatch",
    severity: "error",
    description: "Wrong number of arguments",
  },
  TS1005: { type: "syntax", severity: "error", description: "Expected token" },
  TS1128: {
    type: "syntax",
    severity: "error",
    description: "Unexpected token",
  },
  TS2786: {
    type: "type_mismatch",
    severity: "error",
    description: "Component not valid JSX",
  },
  TS7026: {
    type: "type_mismatch",
    severity: "warning",
    description: "JSX element has any type",
  },
};

export const STAGE_DETECTION_PATTERNS: {
  pattern: RegExp;
  stage: BuildStage;
}[] = [
  { pattern: /vite|esbuild|transform/i, stage: "transform" },
  { pattern: /tsc|type.?check|diagnostic/i, stage: "typecheck" },
  { pattern: /webpack|rollup|parcel|bundle/i, stage: "bundle" },
  { pattern: /terser|optimize|minif/i, stage: "optimize" },
  { pattern: /nextjs|next build|vercel/i, stage: "compile" },
  { pattern: /babel|swc|parse/i, stage: "parse" },
];
