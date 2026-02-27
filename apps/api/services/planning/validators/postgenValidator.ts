import { createLogger } from '../../../utils/logger.js';
import {
  MARKDOWN_FENCE_PATTERN,
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

export function validateGeneratedOutput(output: GeneratedOutput): ValidationResult {
  const violations: ValidationViolation[] = [];
  const declaredPackages = new Set(output.declaredPackages);
  const modeBehavior = resolveGeneratedOutputModeBehavior(output.mode);
  const shouldValidateFramework =
    Boolean(output.framework) && modeBehavior.validatesFrameworkRules;

  if (modeBehavior.requiresGenerateProjectFiles) {
    const frameworkSpecificRequiredFiles = output.framework
      ? (REQUIRED_GENERATE_PROJECT_FILES_BY_FRAMEWORK[output.framework] ?? [])
      : [];
    const requiredFiles = [
      ...REQUIRED_GENERATE_PROJECT_FILES,
      ...frameworkSpecificRequiredFiles,
    ];

    for (const requiredFile of requiredFiles) {
      if (!output.files.has(requiredFile)) {
        violations.push({
          type: VALIDATION_VIOLATION_TYPE.MISSING_PROJECT_FILE,
          severity: VALIDATION_SEVERITY.ERROR,
          message: `Missing required project file in generate mode: ${requiredFile}`,
          file: requiredFile,
        });
      }
    }
  }

  if (output.framework && shouldValidateFramework) {
    const required = REQUIRED_ENTRY_POINTS[output.framework];
    if (required) {
      for (const entryPoint of required) {
        if (!output.files.has(entryPoint)) {
          violations.push({
            type: VALIDATION_VIOLATION_TYPE.MISSING_ENTRY_POINT,
            severity: VALIDATION_SEVERITY.ERROR,
            message: `Missing required entry point: ${entryPoint} (framework: ${output.framework})`,
            file: entryPoint,
          });
        }
      }
    }
  }

  if (output.framework && shouldValidateFramework) {
    const cssRule = REQUIRED_CSS_IMPORTS[output.framework];
    if (cssRule) {
      const { file, importPattern } = cssRule;
      const content = output.files.get(file);
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

  for (const [filePath, content] of output.files) {
    if (MARKDOWN_FENCE_PATTERN.test(content)) {
      violations.push({
        type: VALIDATION_VIOLATION_TYPE.MARKDOWN_FENCE,
        severity: VALIDATION_SEVERITY.ERROR,
        message: `File contains markdown fences (triple backticks) which will break the build`,
        file: filePath,
      });
    }
    violations.push(...validateRelativeImportsForFile(filePath, content, output.files));
    violations.push(
      ...validateMissingPackagesForFile(
        filePath,
        content,
        output.framework,
        declaredPackages,
      ),
    );
    violations.push(...validateImportPlacementForFile(filePath, content, output.mode));
    violations.push(...validateLogicQualityForFile(filePath, content, output.mode));
  }

  violations.push(...validateFrameworkEntrypoints(output));
  violations.push(...validateSeoBranding(output));

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
