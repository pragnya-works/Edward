import {
  EMPTY_HANDLER_PATTERN,
  EMPTY_ROOT_COMPONENT_PATTERN,
  INVALID_ZUSTAND_DEFAULT_IMPORT_PATTERN,
  PLACEHOLDER_PATTERN,
  SOURCE_FILE_PATTERN,
} from './postgenValidator.constants.js';
import type { GeneratedOutput, ValidationViolation } from './postgenValidator.types.js';

export function validateFrameworkEntrypoints(output: GeneratedOutput): ValidationViolation[] {
  const violations: ValidationViolation[] = [];

  const mainFile = output.files.get('src/main.tsx');
  if (output.framework === 'vite-react' && mainFile) {
    if (!/from\s+['"]react-dom\/client['"]/.test(mainFile)) {
      violations.push({
        type: 'missing-entry-point',
        severity: 'error',
        message: `src/main.tsx must import createRoot from react-dom/client.`,
        file: 'src/main.tsx',
      });
    }

    if (!/import\s+App\s+from\s+['"]\.\/App['"]/.test(mainFile)) {
      violations.push({
        type: 'missing-entry-point',
        severity: 'error',
        message: `src/main.tsx must import App from './App'.`,
        file: 'src/main.tsx',
      });
    }

    if (!/createRoot\s*\(/.test(mainFile) || !/document\.getElementById\(\s*['"]root['"]\s*\)/.test(mainFile)) {
      violations.push({
        type: 'missing-entry-point',
        severity: 'error',
        message: `src/main.tsx must mount using createRoot(document.getElementById('root')).`,
        file: 'src/main.tsx',
      });
    }
  }

  const indexHtml = output.files.get('index.html');
  if (output.framework === 'vite-react' && indexHtml && !/id=["']root["']/.test(indexHtml)) {
    violations.push({
      type: 'missing-entry-point',
      severity: 'error',
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
  const severity = mode === 'generate' ? 'error' : 'warning';

  if (isSourceFile && PLACEHOLDER_PATTERN.test(content)) {
    violations.push({
      type: 'logic-quality',
      severity,
      message: `${filePath} contains placeholder markers (TODO/FIXME/TBD/lorem ipsum). Provide complete implementation.`,
      file: filePath,
    });
  }

  if (
    (filePath === 'src/App.tsx' || filePath === 'src/app/page.tsx') &&
    EMPTY_ROOT_COMPONENT_PATTERN.test(content)
  ) {
    violations.push({
      type: 'logic-quality',
      severity: 'error',
      message: `${filePath} returns an empty UI (null/empty fragment). Root components must render meaningful content.`,
      file: filePath,
    });
  }

  if (isSourceFile && EMPTY_HANDLER_PATTERN.test(content)) {
    violations.push({
      type: 'logic-quality',
      severity: 'warning',
      message: `${filePath} includes no-op event handlers. Replace empty handlers with actual logic or remove them.`,
      file: filePath,
    });
  }

  if (isSourceFile && INVALID_ZUSTAND_DEFAULT_IMPORT_PATTERN.test(content)) {
    violations.push({
      type: 'logic-quality',
      severity,
      message: `${filePath} uses a default import from "zustand". Use named import syntax (for example: import { create } from "zustand").`,
      file: filePath,
    });
  }

  return violations;
}
