import {
  ABSOLUTE_HTTP_URL_PATTERN,
  EDWARD_FAVICON_ASSET_BASE,
  GENERATED_OUTPUT_FRAMEWORK,
  HTML_CANONICAL_HREF_PATTERN,
  HTML_CANONICAL_LINK_PATTERN,
  HTML_REQUIRED_BRANDING_PATTERNS,
  HTML_REQUIRED_SEO_PATTERNS,
  NEXT_REQUIRED_BRANDING_PATTERNS,
  NEXT_REQUIRED_SEO_PATTERNS,
} from './postgenValidator.constants.js';
import type {
  GeneratedOutput,
  PatternRequirement,
  ValidationViolation,
} from './postgenValidator.types.js';
import {
  isGenerateMode,
  VALIDATION_SEVERITY,
  VALIDATION_VIOLATION_TYPE,
} from './postgenValidator.types.js';

export function validateSeoBranding(output: GeneratedOutput): ValidationViolation[] {
  if (!isGenerateMode(output.mode) || !output.framework) {
    return [];
  }

  if (output.framework === GENERATED_OUTPUT_FRAMEWORK.NEXTJS) {
    return validateNextSeoBranding(output.files);
  }

  if (
    output.framework === GENERATED_OUTPUT_FRAMEWORK.VITE_REACT ||
    output.framework === GENERATED_OUTPUT_FRAMEWORK.VANILLA
  ) {
    return validateHtmlSeoBranding(output.files, output.framework);
  }

  return [];
}

function validateNextSeoBranding(
  files: Map<string, string>,
): ValidationViolation[] {
  const layoutPath = 'src/app/layout.tsx';
  const layoutContent = files.get(layoutPath);
  const violations: ValidationViolation[] = [];

  if (layoutContent) {
    const missingBranding = findMissingPatternLabels(
      layoutContent,
      NEXT_REQUIRED_BRANDING_PATTERNS,
    );
    const missingSeo = findMissingPatternLabels(layoutContent, NEXT_REQUIRED_SEO_PATTERNS);
    const missingRequirements = [...missingBranding, ...missingSeo];

    if (missingRequirements.length > 0) {
      violations.push({
        type: VALIDATION_VIOLATION_TYPE.MISSING_SEO_BRANDING,
        severity: VALIDATION_SEVERITY.WARNING,
        message: `${layoutPath} must include Edward favicon URLs from ${EDWARD_FAVICON_ASSET_BASE} and required Next metadata fields. Missing: ${missingRequirements.join(', ')}.`,
        file: layoutPath,
      });
    }
  }

  return violations;
}

function validateHtmlSeoBranding(
  files: Map<string, string>,
  framework: GeneratedOutput['framework'],
): ValidationViolation[] {
  const htmlPath = 'index.html';
  const htmlContent = files.get(htmlPath);
  if (!htmlContent) {
    return [];
  }

  const missingBranding = findMissingPatternLabels(
    htmlContent,
    HTML_REQUIRED_BRANDING_PATTERNS,
  );
  const missingSeo = findMissingPatternLabels(htmlContent, HTML_REQUIRED_SEO_PATTERNS);
  const missingRequirements = [...missingBranding, ...missingSeo];

  const violations: ValidationViolation[] = [];

  if (missingRequirements.length > 0) {
    violations.push({
      type: VALIDATION_VIOLATION_TYPE.MISSING_SEO_BRANDING,
      severity: VALIDATION_SEVERITY.WARNING,
      message: `${framework} ${htmlPath} must include Edward favicon + manifest URLs from ${EDWARD_FAVICON_ASSET_BASE} plus description/canonical/Open Graph/Twitter metadata. Missing: ${missingRequirements.join(', ')}.`,
      file: htmlPath,
    });
  }

  const canonicalTag = htmlContent.match(HTML_CANONICAL_LINK_PATTERN)?.[0];
  const canonicalHref = canonicalTag?.match(HTML_CANONICAL_HREF_PATTERN)?.[1]?.trim();
  if (canonicalHref && !ABSOLUTE_HTTP_URL_PATTERN.test(canonicalHref)) {
    violations.push({
      type: VALIDATION_VIOLATION_TYPE.INVALID_CANONICAL_URL,
      severity: VALIDATION_SEVERITY.ERROR,
      message: `${framework} ${htmlPath} must use an absolute canonical URL (http/https). Found: "${canonicalHref}".`,
      file: htmlPath,
    });
  }

  return violations;
}

function findMissingPatternLabels(
  content: string,
  requirements: readonly PatternRequirement[],
): string[] {
  return requirements
    .filter((requirement) => !requirement.pattern.test(content))
    .map((requirement) => requirement.label);
}
