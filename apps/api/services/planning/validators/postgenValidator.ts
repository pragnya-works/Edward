import { createLogger } from '../../../utils/logger.js';
import {
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
import { resolveValidationFramework } from './postgenValidator.framework.js';
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
    if (modeBehavior.requiresGenerateProjectFiles) {
      const lineCount = countContentLines(content);
      if (lineCount > MAX_GENERATED_FILE_LINES) {
        violations.push({
          type: VALIDATION_VIOLATION_TYPE.FILE_LINE_LIMIT_EXCEEDED,
          severity: VALIDATION_SEVERITY.ERROR,
          message: `${filePath} exceeds the maximum allowed ${MAX_GENERATED_FILE_LINES} lines (${lineCount} lines).`,
          file: filePath,
        });
      }
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
