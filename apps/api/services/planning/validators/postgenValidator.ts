import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('PostGenValidator');

export interface ValidationViolation {
  type: 'missing-entry-point' | 'orphaned-import' | 'markdown-fence' | 'missing-package';
  severity: 'error' | 'warning';
  message: string;
  file?: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
}

interface GeneratedOutput {
  framework?: string;
  files: Map<string, string>;
  declaredPackages: string[];
}

const REQUIRED_ENTRY_POINTS: Record<string, string[]> = {
  nextjs: ['src/app/layout.tsx', 'src/app/page.tsx'],
  'vite-react': ['src/main.tsx', 'src/App.tsx'],
  vanilla: ['index.html'],
};

const REQUIRED_CSS_IMPORTS: Record<string, { file: string; importPattern: RegExp }> = {
  nextjs: { file: 'src/app/layout.tsx', importPattern: /import\s+['"]\.\/globals\.css['"]/ },
  'vite-react': { file: 'src/main.tsx', importPattern: /import\s+['"]\.\/index\.css['"]/ },
};
const IMPORT_TO_PACKAGE: Record<string, string> = {
  'framer-motion': 'framer-motion',
  'motion': 'framer-motion',
  'lucide-react': 'lucide-react',
  'next-themes': 'next-themes',
  'react-router-dom': 'react-router-dom',
  'class-variance-authority': 'class-variance-authority',
  '@radix-ui/react-slot': '@radix-ui/react-slot',
  'clsx': 'clsx',
  'tailwind-merge': 'tailwind-merge',
  'zod': 'zod',
  'zustand': 'zustand',
  'react-hook-form': 'react-hook-form',
  '@hookform/resolvers': '@hookform/resolvers',
  'date-fns': 'date-fns',
  'recharts': 'recharts',
};

export function validateGeneratedOutput(output: GeneratedOutput): ValidationResult {
  const violations: ValidationViolation[] = [];

  if (output.framework) {
    const required = REQUIRED_ENTRY_POINTS[output.framework];
    if (required) {
      for (const entryPoint of required) {
        if (!output.files.has(entryPoint)) {
          violations.push({
            type: 'missing-entry-point',
            severity: 'error',
            message: `Missing required entry point: ${entryPoint} (framework: ${output.framework})`,
            file: entryPoint,
          });
        }
      }
    }
  }

  if (output.framework) {
    const cssRule = REQUIRED_CSS_IMPORTS[output.framework];
    if (cssRule) {
      const { file, importPattern } = cssRule;
      const content = output.files.get(file);
      if (content && !importPattern.test(content)) {
        violations.push({
          type: 'missing-entry-point',
          severity: 'error',
          message: `${file} does not import the required CSS file`,
          file,
        });
      }
    }
  }

  for (const [filePath, content] of output.files) {
    if (/^```/m.test(content)) {
      violations.push({
        type: 'markdown-fence',
        severity: 'error',
        message: `File contains markdown fences (triple backticks) which will break the build`,
        file: filePath,
      });
    }
  }

  for (const [filePath, content] of output.files) {
    const importMatches = content.matchAll(/(?:import|from)\s+['"](\.[^'"]+)['"]/g);
    for (const match of importMatches) {
      const importPath = match[1];
      if (!importPath) continue;
      const resolvedPath = resolveImportPath(filePath, importPath);
      if (resolvedPath && !fileExists(resolvedPath, output.files)) {
        violations.push({
          type: 'orphaned-import',
          severity: 'warning',
          message: `Import "${importPath}" in ${filePath} does not match any generated file`,
          file: filePath,
        });
      }
    }
  }

  for (const [filePath, content] of output.files) {
    const importMatches = content.matchAll(/(?:import|from)\s+['"]([^./][^'"]*)['"]/g);
    for (const match of importMatches) {
      const importedModule = match[1];
      if (!importedModule) continue;
      if (isBuiltinModule(importedModule, output.framework)) continue;

      const packageName = getPackageName(importedModule);
      if (IMPORT_TO_PACKAGE[packageName] && !output.declaredPackages.includes(IMPORT_TO_PACKAGE[packageName])) {
        violations.push({
          type: 'missing-package',
          severity: 'warning',
          message: `${filePath} imports "${packageName}" but it's not in <edward_install> packages`,
          file: filePath,
        });
      }
    }
  }

  const valid = violations.filter(v => v.severity === 'error').length === 0;

  if (violations.length > 0) {
    logger.info({ 
      valid, 
      errorCount: violations.filter(v => v.severity === 'error').length,
      warningCount: violations.filter(v => v.severity === 'warning').length,
    }, 'Post-generation validation completed');
  }

  return { valid, violations };
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
  const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];
  return extensions.some(ext => files.has(resolvedPath + ext));
}

function isBuiltinModule(moduleName: string, framework?: string): boolean {
  const builtins = new Set([
    'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime',
    'next', 'next/link', 'next/image', 'next/navigation', 'next/dynamic',
    'next/font', 'next/font/google', 'next/font/local', 'next/headers',
    'next/server', 'next-themes',
  ]);
  if (framework === 'nextjs') {
    return builtins.has(moduleName) || moduleName.startsWith('next/');
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
