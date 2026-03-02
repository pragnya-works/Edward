import { createLogger } from '../../../utils/logger.js';
import {
  GENERATED_OUTPUT_FRAMEWORK,
  MARKDOWN_FENCE_PATTERN,
  MAX_GENERATED_FILE_LINES,
  REQUIRED_CSS_IMPORTS,
  REQUIRED_ENTRY_POINTS,
  REQUIRED_GENERATE_PROJECT_FILES,
  REQUIRED_GENERATE_PROJECT_FILES_BY_FRAMEWORK,
} from './postgenValidator.constants.js';
import {
  validateImportPlacementForFile,
  validateMissingPackagesForFile,
  validateRelativeImportsForFile,
} from './postgenValidator.imports.js';
import {
  validateFrameworkEntrypoints,
  validateLogicQualityForFile,
  validateFeatureSkeletonForOutput,
} from './postgenValidator.logic.js';
import { validateSeoBranding } from './postgenValidator.seo.js';
import type {
  GeneratedOutput,
  ValidationResult,
  ValidationViolation
} from './postgenValidator.types.js';
import {
  countErrorViolations,
  resolveGeneratedOutputModeBehavior,
  VALIDATION_VIOLATION_TYPE,
  VALIDATION_SEVERITY,
} from './postgenValidator.types.js';

const logger = createLogger('PostGenValidator');

function countContentLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  const normalized = content.replace(/\r\n/g, '\n');
  const withoutTrailingNewline = normalized.endsWith('\n')
    ? normalized.slice(0, -1)
    : normalized;
  return withoutTrailingNewline.length === 0
    ? 0
    : withoutTrailingNewline.split('\n').length;
}

const NEXT_CONFIG_FILES = new Set([
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'next.config.cjs',
]);
const VITE_CONFIG_FILES = new Set([
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
]);
const NEXT_APP_ROUTER_ENTRY_FILES = [
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'app/layout.tsx',
  'app/page.tsx',
];
const NEXT_PAGES_ROUTER_ENTRY_FILES = [
  'src/pages/_app.tsx',
  'src/pages/_app.ts',
  'src/pages/_app.jsx',
  'src/pages/_app.js',
  'pages/_app.tsx',
  'pages/_app.ts',
  'pages/_app.jsx',
  'pages/_app.js',
];
const VITE_MAIN_ENTRY_FILES = ['src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js'];
const VITE_APP_ENTRY_FILES = ['src/App.tsx', 'src/App.ts', 'src/App.jsx', 'src/App.js'];
const VITE_REACT_STRONG_ENTRY_FILES = ['src/main.tsx', 'src/main.jsx', 'src/App.tsx', 'src/App.jsx'];
const CLASSIC_VANILLA_FILE_HINTS = ['script.js', 'styles.css', 'main.js', 'main.css'];
const REACT_SIGNAL_PATTERN =
  /from\s+['"]react(?:-dom(?:\/client)?)?['"]|import\s+React\b|createRoot\s*\(|ReactDOM\.createRoot\s*\(/;
const HTML_CLASSIC_SCRIPT_PATTERN = /<script[^>]+src=["'][^"']*(?:script|main)\.js["'][^>]*>/i;
const HTML_CLASSIC_STYLE_PATTERN =
  /<link[^>]+href=["'][^"']*(?:style|styles|main)\.css["'][^>]*>/i;
const HTML_LOCAL_SCRIPT_REF_PATTERN =
  /<script[^>]+src=["'](?!https?:\/\/|\/\/|\/src\/main\.(?:t|j)sx?)[^"']+\.js(?:\?[^"']*)?["'][^>]*>/i;
const HTML_LOCAL_STYLE_REF_PATTERN =
  /<link[^>]+href=["'](?!https?:\/\/|\/\/|\/src\/index\.css)[^"']+\.css(?:\?[^"']*)?["'][^>]*>/i;
const HTML_INLINE_SCRIPT_PATTERN = /<script(?![^>]+\bsrc=)[^>]*>[\s\S]*?<\/script>/i;
const HTML_INLINE_STYLE_PATTERN = /<style[^>]*>[\s\S]*?<\/style>/i;
const HTML_VITE_MAIN_REF_PATTERN =
  /<script[^>]+src=["'](?:\/|\.\/)?src\/main\.(?:t|j)sx?(?:\?[^"']*)?["'][^>]*>/i;

function hasAnyFile(
  files: Map<string, string>,
  fileCandidates: readonly string[],
): boolean {
  return fileCandidates.some((candidate) => files.has(candidate));
}

function containsReactSignals(files: Map<string, string>): boolean {
  for (const [filePath, content] of files) {
    if (!/\.(ts|tsx|js|jsx)$/i.test(filePath)) {
      continue;
    }

    if (REACT_SIGNAL_PATTERN.test(content)) {
      return true;
    }
  }

  return false;
}

function detectNextFrameworkIndicators(
  files: Map<string, string>,
  filePaths: readonly string[],
): boolean {
  return (
    filePaths.some((filePath) => NEXT_CONFIG_FILES.has(filePath)) ||
    hasAnyFile(files, NEXT_APP_ROUTER_ENTRY_FILES) ||
    hasAnyFile(files, NEXT_PAGES_ROUTER_ENTRY_FILES)
  );
}

interface FrameworkDetectionInputs {
  filePaths: readonly string[];
  indexHtml: string;
  hasReactSignals: boolean;
  hasNextFrameworkIndicators: boolean;
  hasViteConfig: boolean;
  hasStrongViteReactEntries: boolean;
  hasScriptEntrypoints: boolean;
  hasHtmlViteMainRef: boolean;
}

interface FrameworkSignalContext {
  hasNextFrameworkIndicators: boolean;
  hasViteFrameworkIndicators: boolean;
  hasStrongVanillaIndicators: boolean;
  hasNextEntrypoints: boolean;
  hasViteEntrypoints: boolean;
}

function detectStrongVanillaIndicators(
  files: Map<string, string>,
  inputs: FrameworkDetectionInputs,
): boolean {
  const {
    filePaths,
    indexHtml,
    hasReactSignals,
    hasNextFrameworkIndicators,
    hasViteConfig,
    hasStrongViteReactEntries,
    hasHtmlViteMainRef,
  } = inputs;

  if (!files.has('index.html')) {
    return false;
  }

  const hasNextConfig = filePaths.some((filePath) => NEXT_CONFIG_FILES.has(filePath));
  if (hasNextConfig || hasViteConfig) {
    return false;
  }

  if (hasNextFrameworkIndicators) {
    return false;
  }

  if (hasStrongViteReactEntries) {
    return false;
  }

  if (hasReactSignals) {
    return false;
  }

  if (hasHtmlViteMainRef) {
    return false;
  }

  const hasClassicVanillaFiles = CLASSIC_VANILLA_FILE_HINTS.some((fileName) =>
    files.has(fileName),
  );
  const hasTopLevelJsOrCssFiles = filePaths.some(
    (filePath) =>
      !filePath.startsWith('src/') &&
      !filePath.startsWith('app/') &&
      (filePath.endsWith('.js') || filePath.endsWith('.css')),
  );
  const referencesClassicAssets =
    HTML_CLASSIC_SCRIPT_PATTERN.test(indexHtml) ||
    HTML_CLASSIC_STYLE_PATTERN.test(indexHtml);
  const referencesLocalAssets =
    HTML_LOCAL_SCRIPT_REF_PATTERN.test(indexHtml) ||
    HTML_LOCAL_STYLE_REF_PATTERN.test(indexHtml);
  const hasInlineAssets =
    HTML_INLINE_SCRIPT_PATTERN.test(indexHtml) ||
    HTML_INLINE_STYLE_PATTERN.test(indexHtml);

  return (
    hasClassicVanillaFiles ||
    hasTopLevelJsOrCssFiles ||
    referencesClassicAssets ||
    referencesLocalAssets ||
    hasInlineAssets
  );
}

function detectViteFrameworkIndicators(inputs: FrameworkDetectionInputs): boolean {
  const {
    hasViteConfig,
    hasStrongViteReactEntries,
    hasScriptEntrypoints,
    hasReactSignals,
    hasHtmlViteMainRef,
  } = inputs;
  return (
    hasViteConfig ||
    hasStrongViteReactEntries ||
    (hasScriptEntrypoints && hasReactSignals) ||
    hasHtmlViteMainRef
  );
}

function buildFrameworkSignalContext(files: Map<string, string>): FrameworkSignalContext {
  const filePaths = Array.from(files.keys());
  const indexHtml = files.get('index.html') ?? '';
  const hasReactSignals = containsReactSignals(files);
  const hasNextFrameworkIndicators = detectNextFrameworkIndicators(files, filePaths);
  const hasViteConfig = filePaths.some((filePath) => VITE_CONFIG_FILES.has(filePath));
  const hasStrongViteReactEntries = hasAnyFile(files, VITE_REACT_STRONG_ENTRY_FILES);
  const hasScriptEntrypoints =
    hasAnyFile(files, VITE_MAIN_ENTRY_FILES) || hasAnyFile(files, VITE_APP_ENTRY_FILES);
  const hasHtmlViteMainRef = HTML_VITE_MAIN_REF_PATTERN.test(indexHtml);

  const detectionInputs: FrameworkDetectionInputs = {
    filePaths,
    indexHtml,
    hasReactSignals,
    hasNextFrameworkIndicators,
    hasViteConfig,
    hasStrongViteReactEntries,
    hasScriptEntrypoints,
    hasHtmlViteMainRef,
  };

  const hasViteFrameworkIndicators = detectViteFrameworkIndicators(detectionInputs);
  const hasStrongVanillaIndicators = detectStrongVanillaIndicators(
    files,
    detectionInputs,
  );
  const hasNextEntrypoints =
    files.has('src/app/layout.tsx') && files.has('src/app/page.tsx');
  const hasViteMainEntrypoint = hasAnyFile(files, VITE_MAIN_ENTRY_FILES);
  const hasViteAppEntrypoint = hasAnyFile(files, VITE_APP_ENTRY_FILES);
  const hasViteEntrypoints = hasViteMainEntrypoint && hasViteAppEntrypoint;

  return {
    hasNextFrameworkIndicators,
    hasViteFrameworkIndicators,
    hasStrongVanillaIndicators,
    hasNextEntrypoints,
    hasViteEntrypoints,
  };
}

function inferFrameworkFromSignals(
  signals: FrameworkSignalContext,
): GeneratedOutput["framework"] {
  const {
    hasNextFrameworkIndicators,
    hasViteFrameworkIndicators,
    hasStrongVanillaIndicators,
  } = signals;

  if (hasNextFrameworkIndicators && !hasViteFrameworkIndicators) {
    return GENERATED_OUTPUT_FRAMEWORK.NEXTJS;
  }
  if (hasViteFrameworkIndicators && !hasNextFrameworkIndicators) {
    return GENERATED_OUTPUT_FRAMEWORK.VITE_REACT;
  }
  if (
    !hasNextFrameworkIndicators &&
    !hasViteFrameworkIndicators &&
    hasStrongVanillaIndicators
  ) {
    return GENERATED_OUTPUT_FRAMEWORK.VANILLA;
  }
  return undefined;
}

function resolveValidationFramework(
  framework: GeneratedOutput["framework"],
  files: Map<string, string>,
): GeneratedOutput["framework"] {
  const signals = buildFrameworkSignalContext(files);
  const frameworkToValidate = framework ?? inferFrameworkFromSignals(signals);
  if (!frameworkToValidate) {
    return frameworkToValidate;
  }

  const {
    hasNextEntrypoints,
    hasViteEntrypoints,
    hasNextFrameworkIndicators,
    hasViteFrameworkIndicators,
    hasStrongVanillaIndicators,
  } = signals;

  if (
    frameworkToValidate === GENERATED_OUTPUT_FRAMEWORK.VANILLA &&
    hasNextFrameworkIndicators &&
    !hasViteFrameworkIndicators
  ) {
    return GENERATED_OUTPUT_FRAMEWORK.NEXTJS;
  }

  if (
    frameworkToValidate === GENERATED_OUTPUT_FRAMEWORK.VANILLA &&
    hasViteFrameworkIndicators &&
    !hasNextFrameworkIndicators
  ) {
    return GENERATED_OUTPUT_FRAMEWORK.VITE_REACT;
  }

  if (
    frameworkToValidate === GENERATED_OUTPUT_FRAMEWORK.VITE_REACT &&
    hasNextEntrypoints &&
    !hasViteEntrypoints
  ) {
    return GENERATED_OUTPUT_FRAMEWORK.NEXTJS;
  }

  if (
    frameworkToValidate === GENERATED_OUTPUT_FRAMEWORK.NEXTJS &&
    hasViteEntrypoints &&
    !hasNextEntrypoints
  ) {
    return GENERATED_OUTPUT_FRAMEWORK.VITE_REACT;
  }

  if (
    frameworkToValidate === GENERATED_OUTPUT_FRAMEWORK.VITE_REACT &&
    hasStrongVanillaIndicators &&
    !hasViteEntrypoints &&
    !hasNextEntrypoints
  ) {
    return GENERATED_OUTPUT_FRAMEWORK.VANILLA;
  }

  if (
    frameworkToValidate === GENERATED_OUTPUT_FRAMEWORK.NEXTJS &&
    hasStrongVanillaIndicators &&
    !hasNextEntrypoints &&
    !hasViteEntrypoints
  ) {
    return GENERATED_OUTPUT_FRAMEWORK.VANILLA;
  }

  return frameworkToValidate;
}

export function validateGeneratedOutput(output: GeneratedOutput): ValidationResult {
  const effectiveFramework = resolveValidationFramework(output.framework, output.files);
  if (effectiveFramework !== output.framework) {
    logger.warn(
      {
        declaredFramework: output.framework,
        effectiveFramework,
      },
      'Detected framework mismatch during post-generation validation; using entrypoint-inferred framework',
    );
  }

  const validatedOutput = {
    ...output,
    framework: effectiveFramework,
  };
  const violations: ValidationViolation[] = [];
  const declaredPackages = new Set(validatedOutput.declaredPackages);
  const modeBehavior = resolveGeneratedOutputModeBehavior(validatedOutput.mode);
  const shouldValidateFramework =
    Boolean(validatedOutput.framework) && modeBehavior.validatesFrameworkRules;

  if (modeBehavior.requiresGenerateProjectFiles) {
    const frameworkSpecificRequiredFiles = validatedOutput.framework
      ? (REQUIRED_GENERATE_PROJECT_FILES_BY_FRAMEWORK[validatedOutput.framework] ?? [])
      : [];
    const requiredFiles = [
      ...REQUIRED_GENERATE_PROJECT_FILES,
      ...frameworkSpecificRequiredFiles,
    ];

    for (const requiredFile of requiredFiles) {
      if (!validatedOutput.files.has(requiredFile)) {
        violations.push({
          type: VALIDATION_VIOLATION_TYPE.MISSING_PROJECT_FILE,
          severity: VALIDATION_SEVERITY.ERROR,
          message: `Missing required project file in generate mode: ${requiredFile}`,
          file: requiredFile,
        });
      }
    }
  }

  if (validatedOutput.framework && shouldValidateFramework) {
    const required = REQUIRED_ENTRY_POINTS[validatedOutput.framework];
    if (required) {
      for (const entryPoint of required) {
        if (!validatedOutput.files.has(entryPoint)) {
          violations.push({
            type: VALIDATION_VIOLATION_TYPE.MISSING_ENTRY_POINT,
            severity: VALIDATION_SEVERITY.ERROR,
            message: `Missing required entry point: ${entryPoint} (framework: ${validatedOutput.framework})`,
            file: entryPoint,
          });
        }
      }
    }
  }

  if (validatedOutput.framework && shouldValidateFramework) {
    const cssRule = REQUIRED_CSS_IMPORTS[validatedOutput.framework];
    if (cssRule) {
      const { file, importPattern } = cssRule;
      const content = validatedOutput.files.get(file);
      if (content && !importPattern.test(content)) {
        violations.push({
          type: VALIDATION_VIOLATION_TYPE.MISSING_ENTRY_POINT,
          severity: VALIDATION_SEVERITY.ERROR,
          message: `${file} does not import the required CSS file`,
          file,
        });
      }
    }
  }

  for (const [filePath, content] of validatedOutput.files) {
    const lineCount = countContentLines(content);
    if (lineCount > MAX_GENERATED_FILE_LINES) {
      violations.push({
        type: VALIDATION_VIOLATION_TYPE.FILE_LINE_LIMIT_EXCEEDED,
        severity: VALIDATION_SEVERITY.ERROR,
        message: `${filePath} exceeds the maximum allowed ${MAX_GENERATED_FILE_LINES} lines (${lineCount} lines).`,
        file: filePath,
      });
    }

    if (MARKDOWN_FENCE_PATTERN.test(content)) {
      violations.push({
        type: VALIDATION_VIOLATION_TYPE.MARKDOWN_FENCE,
        severity: VALIDATION_SEVERITY.ERROR,
        message: `File contains markdown fences (triple backticks) which will break the build`,
        file: filePath,
      });
    }
    violations.push(
      ...validateRelativeImportsForFile(filePath, content, validatedOutput.files),
    );
    violations.push(
      ...validateMissingPackagesForFile(
        filePath,
        content,
        validatedOutput.framework,
        declaredPackages,
      ),
    );
    violations.push(
      ...validateImportPlacementForFile(filePath, content, validatedOutput.mode),
    );
    violations.push(
      ...validateLogicQualityForFile(filePath, content, validatedOutput.mode),
    );
  }

  if (validatedOutput.framework && shouldValidateFramework) {
    violations.push(...validateFrameworkEntrypoints(validatedOutput));
  }
  violations.push(...validateSeoBranding(validatedOutput));
  violations.push(...validateFeatureSkeletonForOutput(validatedOutput));

  const errorCount = countErrorViolations(violations);
  const warningCount = violations.length - errorCount;
  const valid = errorCount === 0;

  if (violations.length > 0) {
    logger.info({
      valid,
      errorCount,
      warningCount,
    }, 'Post-generation validation completed');
  }

  return { valid, violations };
}
