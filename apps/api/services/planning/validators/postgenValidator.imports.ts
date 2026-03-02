import {
  GENERATED_OUTPUT_FRAMEWORK,
  IMPORT_TO_PACKAGE,
  LOCAL_FILE_EXTENSIONS,
  NEXT_BUILTIN_MODULES,
  PACKAGE_IMPORT_PATTERN,
  RELATIVE_IMPORT_PATTERN,
  SOURCE_FILE_PATTERN,
} from './postgenValidator.constants.js';
import type { GeneratedOutput, ValidationViolation } from './postgenValidator.types.js';
import {
  isGenerateMode,
  VALIDATION_SEVERITY,
  VALIDATION_VIOLATION_TYPE,
} from './postgenValidator.types.js';

export function validateRelativeImportsForFile(
  filePath: string,
  content: string,
  files: Map<string, string>,
): ValidationViolation[] {
  const violations: ValidationViolation[] = [];

  const importMatches = content.matchAll(RELATIVE_IMPORT_PATTERN);
  for (const match of importMatches) {
    const importPath = match[1];
    if (!importPath) continue;
    const resolvedPath = resolveImportPath(filePath, importPath);
    if (resolvedPath && !fileExists(resolvedPath, files)) {
      violations.push({
        type: VALIDATION_VIOLATION_TYPE.ORPHANED_IMPORT,
        severity: VALIDATION_SEVERITY.WARNING,
        message: `Import "${importPath}" in ${filePath} does not match any generated file`,
        file: filePath,
      });
    }
  }

  return violations;
}

export function validateMissingPackagesForFile(
  filePath: string,
  content: string,
  framework: string | undefined,
  declaredPackages: Set<string>,
): ValidationViolation[] {
  const violations: ValidationViolation[] = [];
  const importMatches = content.matchAll(PACKAGE_IMPORT_PATTERN);
  for (const match of importMatches) {
    const importedModule = match[1];
    if (!importedModule) continue;
    if (isBuiltinModule(importedModule, framework)) continue;

    const packageName = getPackageName(importedModule);
    const packageToInstall = IMPORT_TO_PACKAGE[packageName];
    if (packageToInstall && !declaredPackages.has(packageToInstall)) {
      violations.push({
        type: VALIDATION_VIOLATION_TYPE.MISSING_PACKAGE,
        severity: VALIDATION_SEVERITY.WARNING,
        message: `${filePath} imports "${packageName}" but it's not in <edward_install> packages`,
        file: filePath,
      });
    }
  }

  return violations;
}

export function validateImportPlacementForFile(
  filePath: string,
  content: string,
  mode: GeneratedOutput['mode'],
): ValidationViolation[] {
  if (!SOURCE_FILE_PATTERN.test(filePath)) return [];

  const lines = content.split('\n');
  const violations: ValidationViolation[] = [];
  let inBlockComment = false;
  let passedImportSection = false;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const raw = lines[lineNumber] ?? '';
    const line = raw.trim();
    if (!line) continue;

    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }

    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlockComment = true;
      continue;
    }

    if (line.startsWith('//')) continue;
    if (/^['"]use (client|server)['"];?$/.test(line)) continue;

    if (line.startsWith('import ')) {
      if (passedImportSection) {
        violations.push({
          type: VALIDATION_VIOLATION_TYPE.IMPORT_PLACEMENT,
          severity: isGenerateMode(mode)
            ? VALIDATION_SEVERITY.ERROR
            : VALIDATION_SEVERITY.WARNING,
          message: `${filePath}:${lineNumber + 1} has an import after executable code. Keep imports at the top of the file.`,
          file: filePath,
        });
        break;
      }
      continue;
    }

    passedImportSection = true;
  }

  return violations;
}

function resolveImportPath(fromFile: string, importPath: string): string | null {
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
  const parts = [...fromDir.split('/'), ...importPath.split('/')];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.') resolved.push(part);
  }
  return resolved.join('/');
}

function fileExists(resolvedPath: string, files: Map<string, string>): boolean {
  return LOCAL_FILE_EXTENSIONS.some(ext => files.has(resolvedPath + ext));
}

function isBuiltinModule(
  moduleName: string,
  framework?: GeneratedOutput['framework'],
): boolean {
  if (framework === GENERATED_OUTPUT_FRAMEWORK.NEXTJS) {
    return NEXT_BUILTIN_MODULES.has(moduleName) || moduleName.startsWith('next/');
  }
  return moduleName === 'react' || moduleName === 'react-dom' || moduleName.startsWith('react-dom/');
}

function getPackageName(importPath: string): string {
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : importPath;
  }
  return importPath.split('/')[0] ?? importPath;
}
