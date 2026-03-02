export const VALIDATION_VIOLATION_TYPE = {
  MISSING_ENTRY_POINT: 'missing-entry-point',
  MISSING_PROJECT_FILE: 'missing-project-file',
  FILE_LINE_LIMIT_EXCEEDED: 'file-line-limit-exceeded',
  IMPORT_PLACEMENT: 'import-placement',
  LOGIC_QUALITY: 'logic-quality',
  ORPHANED_IMPORT: 'orphaned-import',
  MARKDOWN_FENCE: 'markdown-fence',
  MISSING_PACKAGE: 'missing-package',
  MISSING_SEO_BRANDING: 'missing-seo-branding',
  INVALID_CANONICAL_URL: 'invalid-canonical-url',
  FEATURE_SKELETON: 'feature-skeleton',
} as const;

export type ValidationViolationType =
  (typeof VALIDATION_VIOLATION_TYPE)[keyof typeof VALIDATION_VIOLATION_TYPE];

export const VALIDATION_SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
} as const;

export type ValidationSeverity =
  (typeof VALIDATION_SEVERITY)[keyof typeof VALIDATION_SEVERITY];

export const GENERATED_OUTPUT_MODE = {
  GENERATE: 'generate',
  FIX: 'fix',
  EDIT: 'edit',
} as const;

export type GeneratedOutputMode =
  (typeof GENERATED_OUTPUT_MODE)[keyof typeof GENERATED_OUTPUT_MODE];

export const GENERATED_OUTPUT_FRAMEWORK = {
  NEXTJS: 'nextjs',
  VITE_REACT: 'vite-react',
  VANILLA: 'vanilla',
} as const;

export type GeneratedOutputFramework =
  (typeof GENERATED_OUTPUT_FRAMEWORK)[keyof typeof GENERATED_OUTPUT_FRAMEWORK];

export interface ValidationViolation {
  type: ValidationViolationType;
  severity: ValidationSeverity;
  message: string;
  file?: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
}

export interface GeneratedOutput {
  framework?: string;
  intentType?: string;
  files: Map<string, string>;
  declaredPackages: string[];
  mode?: GeneratedOutputMode;
}

export type PatternRequirement = { pattern: RegExp; label: string };

const MODE_BEHAVIOR_BY_MODE: Record<
  GeneratedOutputMode,
  {
    requiresGenerateProjectFiles: boolean;
    validatesFrameworkRules: boolean;
  }
> = {
  [GENERATED_OUTPUT_MODE.GENERATE]: {
    requiresGenerateProjectFiles: true,
    validatesFrameworkRules: true,
  },
  [GENERATED_OUTPUT_MODE.FIX]: {
    requiresGenerateProjectFiles: false,
    validatesFrameworkRules: false,
  },
  [GENERATED_OUTPUT_MODE.EDIT]: {
    requiresGenerateProjectFiles: false,
    validatesFrameworkRules: false,
  },
};

const DEFAULT_MODE_BEHAVIOR = {
  requiresGenerateProjectFiles: false,
  validatesFrameworkRules: true,
} as const;

const IS_ERROR_SEVERITY: Record<ValidationSeverity, boolean> = {
  [VALIDATION_SEVERITY.ERROR]: true,
  [VALIDATION_SEVERITY.WARNING]: false,
};

export function resolveGeneratedOutputModeBehavior(mode?: GeneratedOutputMode): {
  requiresGenerateProjectFiles: boolean;
  validatesFrameworkRules: boolean;
} {
  if (!mode) {
    return DEFAULT_MODE_BEHAVIOR;
  }
  return MODE_BEHAVIOR_BY_MODE[mode];
}

export function isErrorSeverity(severity: ValidationSeverity): boolean {
  return IS_ERROR_SEVERITY[severity];
}

export function isGenerateMode(mode?: GeneratedOutputMode): boolean {
  return mode === GENERATED_OUTPUT_MODE.GENERATE;
}

export function countErrorViolations(violations: ValidationViolation[]): number {
  return violations.reduce(
    (count, violation) => count + Number(isErrorSeverity(violation.severity)),
    0,
  );
}
