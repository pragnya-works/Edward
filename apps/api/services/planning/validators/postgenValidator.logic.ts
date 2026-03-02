import {
  COMMENT_STUB_PATTERN,
  EMPTY_HANDLER_PATTERN,
  EMPTY_ROOT_COMPONENT_PATTERN,
  GENERATED_OUTPUT_FRAMEWORK,
  INVALID_ZUSTAND_DEFAULT_IMPORT_PATTERN,
  PLACEHOLDER_PATTERN,
  SAMPLE_CONTENT_PATTERN,
  SOURCE_FILE_PATTERN,
} from './postgenValidator.constants.js';
import type { GeneratedOutput, ValidationViolation } from './postgenValidator.types.js';
import {
  VALIDATION_VIOLATION_TYPE,
  VALIDATION_SEVERITY,
  isGenerateMode,
} from './postgenValidator.types.js';

export function validateFrameworkEntrypoints(output: GeneratedOutput): ValidationViolation[] {
  const violations: ValidationViolation[] = [];

  const mainFile = output.files.get('src/main.tsx');
  if (output.framework === GENERATED_OUTPUT_FRAMEWORK.VITE_REACT && mainFile) {
    if (!/from\s+['"]react-dom\/client['"]/.test(mainFile)) {
      violations.push({
        type: VALIDATION_VIOLATION_TYPE.MISSING_ENTRY_POINT,
        severity: VALIDATION_SEVERITY.ERROR,
        message: `src/main.tsx must import createRoot from react-dom/client.`,
        file: 'src/main.tsx',
      });
    }

    if (!/import\s+App\s+from\s+['"]\.\/App['"]/.test(mainFile)) {
      violations.push({
        type: VALIDATION_VIOLATION_TYPE.MISSING_ENTRY_POINT,
        severity: VALIDATION_SEVERITY.ERROR,
        message: `src/main.tsx must import App from './App'.`,
        file: 'src/main.tsx',
      });
    }

    if (!/createRoot\s*\(/.test(mainFile) || !/document\.getElementById\(\s*['"]root['"]\s*\)/.test(mainFile)) {
      violations.push({
        type: VALIDATION_VIOLATION_TYPE.MISSING_ENTRY_POINT,
        severity: VALIDATION_SEVERITY.ERROR,
        message: `src/main.tsx must mount using createRoot(document.getElementById('root')).`,
        file: 'src/main.tsx',
      });
    }
  }

  const indexHtml = output.files.get('index.html');
  if (
    output.framework === GENERATED_OUTPUT_FRAMEWORK.VITE_REACT &&
    indexHtml &&
    !/id=["']root["']/.test(indexHtml)
  ) {
    violations.push({
      type: VALIDATION_VIOLATION_TYPE.MISSING_ENTRY_POINT,
      severity: VALIDATION_SEVERITY.ERROR,
      message: `index.html must include a root mount node with id="root".`,
      file: 'index.html',
    });
  }

  return violations;
}

export function validateLogicQualityForFile(
  filePath: string,
  content: string,
  mode: GeneratedOutput['mode'],
): ValidationViolation[] {
  const violations: ValidationViolation[] = [];
  const isSourceFile = SOURCE_FILE_PATTERN.test(filePath);
  const severity = isGenerateMode(mode)
    ? VALIDATION_SEVERITY.ERROR
    : VALIDATION_SEVERITY.WARNING;

  if (isSourceFile && COMMENT_STUB_PATTERN.test(content)) {
    violations.push({
      type: VALIDATION_VIOLATION_TYPE.LOGIC_QUALITY,
      severity,
      message: `${filePath} contains stub comments (TODO/implement/placeholder). Provide a complete implementation.`,
      file: filePath,
    });
  }

  if (isSourceFile && SAMPLE_CONTENT_PATTERN.test(content)) {
    violations.push({
      type: VALIDATION_VIOLATION_TYPE.LOGIC_QUALITY,
      severity,
      message: `${filePath} contains placeholder content (e.g. "Sample Product", "Product 1"). Use realistic data.`,
      file: filePath,
    });
  }

  if (isSourceFile && PLACEHOLDER_PATTERN.test(content)) {
    violations.push({
      type: VALIDATION_VIOLATION_TYPE.LOGIC_QUALITY,
      severity,
      message: `${filePath} contains placeholder markers (FIXME/TBD/lorem ipsum). Provide complete implementation.`,
      file: filePath,
    });
  }

  if (
    (filePath === 'src/App.tsx' || filePath === 'src/app/page.tsx') &&
    EMPTY_ROOT_COMPONENT_PATTERN.test(content)
  ) {
    violations.push({
      type: VALIDATION_VIOLATION_TYPE.LOGIC_QUALITY,
      severity: VALIDATION_SEVERITY.ERROR,
      message: `${filePath} returns an empty UI (null/empty fragment). Root components must render meaningful content.`,
      file: filePath,
    });
  }

  if (isSourceFile && EMPTY_HANDLER_PATTERN.test(content)) {
    violations.push({
      type: VALIDATION_VIOLATION_TYPE.LOGIC_QUALITY,
      severity: VALIDATION_SEVERITY.WARNING,
      message: `${filePath} includes no-op event handlers. Replace empty handlers with actual logic or remove them.`,
      file: filePath,
    });
  }

  if (isSourceFile && INVALID_ZUSTAND_DEFAULT_IMPORT_PATTERN.test(content)) {
    violations.push({
      type: VALIDATION_VIOLATION_TYPE.LOGIC_QUALITY,
      severity,
      message: `${filePath} uses a default import from "zustand". Use named import syntax (for example: import { create } from "zustand").`,
      file: filePath,
    });
  }

  return violations;
}

const FEATURE_PRESENCE_RULES: Record<string, { patterns: RegExp[]; message: string }> = {
  ecommerce: {
    patterns: [/addToCart|removeFromCart|cartItems|useCart|cartState|CartContext/],
    message: 'E-commerce app appears to have no cart implementation. Cart add/remove/quantity must be fully wired.',
  },
  dashboard: {
    patterns: [
      /useState(?:<[^>]+>)?\s*\(\s*\[\s*[^\s\]]/,
      /useReducer/,
      /data\s*=\s*\[\s*[^\s\]]/,
      /=\s*\[\s*\{/,
    ],
    message: 'Dashboard app has no data state. Charts/tables must use real typed data, not empty arrays.',
  },
};

export function validateFeatureSkeletonForOutput(
  output: GeneratedOutput,
): ValidationViolation[] {
  if (!isGenerateMode(output.mode) || !output.intentType) {
    return [];
  }

  const rule = FEATURE_PRESENCE_RULES[output.intentType];
  if (!rule) {
    return [];
  }

  const combined = [...output.files.entries()]
    .filter(([path]) => SOURCE_FILE_PATTERN.test(path))
    .map(([, content]) => content)
    .join('\n');

  const hasAnyPattern = rule.patterns.some((p) => p.test(combined));
  if (hasAnyPattern) {
    return [];
  }

  return [
    {
      type: VALIDATION_VIOLATION_TYPE.FEATURE_SKELETON,
      severity: VALIDATION_SEVERITY.ERROR,
      message: rule.message,
    },
  ];
}
