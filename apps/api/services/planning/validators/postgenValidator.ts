import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('PostGenValidator');

export interface ValidationViolation {
  type:
    | 'missing-entry-point'
    | 'missing-project-file'
    | 'import-placement'
    | 'logic-quality'
    | 'orphaned-import'
    | 'markdown-fence'
    | 'missing-package'
    | 'missing-seo-branding'
    | 'invalid-canonical-url';
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
  mode?: 'generate' | 'fix' | 'edit';
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

const REQUIRED_GENERATE_PROJECT_FILES = ['README.md'] as const;
const REQUIRED_GENERATE_PROJECT_FILES_BY_FRAMEWORK: Record<string, readonly string[]> = {};
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx)$/i;
const MARKDOWN_FENCE_PATTERN = /^```/m;
const RELATIVE_IMPORT_PATTERN = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
const PACKAGE_IMPORT_PATTERN = /(?:import|from)\s+['"]([^./][^'"]*)['"]/g;
const EMPTY_ROOT_COMPONENT_PATTERN =
  /export\s+default\s+function[\s\S]*?return\s+(?:null|<>\s*<\/>|<React\.Fragment>\s*<\/React\.Fragment>)\s*;?/m;
const PLACEHOLDER_PATTERN =
  /\b(?:TODO|FIXME|TBD)\b|lorem ipsum|your content here|replace with your/i;
const EMPTY_HANDLER_PATTERN = /\bon[A-Z][A-Za-z0-9_]*=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/;
const LOCAL_FILE_EXTENSIONS = [
  '',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '/index.tsx',
  '/index.ts',
  '/index.jsx',
  '/index.js',
];
const NEXT_BUILTIN_MODULES = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'next',
  'next/link',
  'next/image',
  'next/navigation',
  'next/dynamic',
  'next/font',
  'next/font/google',
  'next/font/local',
  'next/headers',
  'next/server',
  'next-themes',
]);

const EDWARD_FAVICON_ASSET_BASE = 'https://assets.pragnyaa.in/home/favicon_io';
type PatternRequirement = { pattern: RegExp; label: string };

const NEXT_REQUIRED_BRANDING_PATTERNS: PatternRequirement[] = [
  {
    pattern: /https:\/\/assets\.pragnyaa\.in\/home\/favicon_io\/favicon\.ico/,
    label: 'favicon.ico URL',
  },
  {
    pattern: /https:\/\/assets\.pragnyaa\.in\/home\/favicon_io\/favicon-16x16\.png/,
    label: 'favicon-16x16 URL',
  },
  {
    pattern: /https:\/\/assets\.pragnyaa\.in\/home\/favicon_io\/favicon-32x32\.png/,
    label: 'favicon-32x32 URL',
  },
  {
    pattern: /https:\/\/assets\.pragnyaa\.in\/home\/favicon_io\/apple-touch-icon\.png/,
    label: 'apple-touch-icon URL',
  },
  {
    pattern: /https:\/\/assets\.pragnyaa\.in\/home\/favicon_io\/site\.webmanifest/,
    label: 'site.webmanifest URL',
  },
];
const NEXT_REQUIRED_SEO_PATTERNS: PatternRequirement[] = [
  { pattern: /\bmetadataBase\b/, label: 'metadataBase' },
  { pattern: /\btitle\s*:/, label: 'title' },
  { pattern: /\bdescription\s*:/, label: 'description' },
  { pattern: /\balternates\s*:/, label: 'alternates' },
  { pattern: /\bcanonical\s*:/, label: 'alternates.canonical' },
  { pattern: /\bopenGraph\s*:/, label: 'openGraph' },
  { pattern: /\btwitter\s*:/, label: 'twitter' },
];
const HTML_REQUIRED_BRANDING_PATTERNS: PatternRequirement[] = [
  {
    pattern: /https:\/\/assets\.pragnyaa\.in\/home\/favicon_io\/favicon\.ico/,
    label: 'favicon.ico URL',
  },
  {
    pattern: /https:\/\/assets\.pragnyaa\.in\/home\/favicon_io\/apple-touch-icon\.png/,
    label: 'apple-touch-icon URL',
  },
  {
    pattern: /https:\/\/assets\.pragnyaa\.in\/home\/favicon_io\/site\.webmanifest/,
    label: 'site.webmanifest URL',
  },
];
const HTML_REQUIRED_SEO_PATTERNS: PatternRequirement[] = [
  { pattern: /<meta[^>]+name=["']description["']/i, label: 'meta description' },
  { pattern: /<link[^>]+rel=["']canonical["']/i, label: 'canonical link' },
  { pattern: /<meta[^>]+property=["']og:title["']/i, label: 'og:title' },
  { pattern: /<meta[^>]+property=["']og:description["']/i, label: 'og:description' },
  { pattern: /<meta[^>]+property=["']og:type["']/i, label: 'og:type' },
  { pattern: /<meta[^>]+name=["']twitter:card["']/i, label: 'twitter:card' },
  { pattern: /<meta[^>]+name=["']twitter:title["']/i, label: 'twitter:title' },
  {
    pattern: /<meta[^>]+name=["']twitter:description["']/i,
    label: 'twitter:description',
  },
];
const HTML_CANONICAL_LINK_PATTERN =
  /<link[^>]+rel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/i;
const HTML_CANONICAL_HREF_PATTERN = /\bhref=["']([^"']+)["']/i;
const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;

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
  const declaredPackages = new Set(output.declaredPackages);
  const shouldValidateFramework =
    Boolean(output.framework) && output.mode !== 'edit' && output.mode !== 'fix';

  if (output.mode === 'generate') {
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
          type: 'missing-project-file',
          severity: 'error',
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
            type: 'missing-entry-point',
            severity: 'error',
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
          type: 'missing-entry-point',
          severity: 'error',
          message: `${file} does not import the required CSS file`,
          file,
        });
      }
    }
  }

  for (const [filePath, content] of output.files) {
    if (MARKDOWN_FENCE_PATTERN.test(content)) {
      violations.push({
        type: 'markdown-fence',
        severity: 'error',
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

  const errorCount = violations.filter(v => v.severity === 'error').length;
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

function validateSeoBranding(output: GeneratedOutput): ValidationViolation[] {
  if (output.mode !== 'generate' || !output.framework) {
    return [];
  }

  if (output.framework === 'nextjs') {
    return validateNextSeoBranding(output.files);
  }

  if (output.framework === 'vite-react' || output.framework === 'vanilla') {
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
        type: 'missing-seo-branding',
        severity: 'warning',
        message: `${layoutPath} must include Edward favicon URLs from ${EDWARD_FAVICON_ASSET_BASE} and required Next metadata fields. Missing: ${missingRequirements.join(', ')}.`,
        file: layoutPath,
      });
    }
  }

  return violations;
}

function validateHtmlSeoBranding(
  files: Map<string, string>,
  framework: string,
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
      type: 'missing-seo-branding',
      severity: 'warning',
      message: `${framework} ${htmlPath} must include Edward favicon + manifest URLs from ${EDWARD_FAVICON_ASSET_BASE} plus description/canonical/Open Graph/Twitter metadata. Missing: ${missingRequirements.join(', ')}.`,
      file: htmlPath,
    });
  }

  const canonicalTag = htmlContent.match(HTML_CANONICAL_LINK_PATTERN)?.[0];
  const canonicalHref = canonicalTag?.match(HTML_CANONICAL_HREF_PATTERN)?.[1]?.trim();
  if (canonicalHref && !ABSOLUTE_HTTP_URL_PATTERN.test(canonicalHref)) {
    violations.push({
      type: 'invalid-canonical-url',
      severity: 'error',
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

function validateRelativeImportsForFile(
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
        type: 'orphaned-import',
        severity: 'warning',
        message: `Import "${importPath}" in ${filePath} does not match any generated file`,
        file: filePath,
      });
    }
  }

  return violations;
}

function validateMissingPackagesForFile(
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
        type: 'missing-package',
        severity: 'warning',
        message: `${filePath} imports "${packageName}" but it's not in <edward_install> packages`,
        file: filePath,
      });
    }
  }

  return violations;
}

function validateImportPlacementForFile(
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
          type: 'import-placement',
          severity: mode === 'generate' ? 'error' : 'warning',
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

function validateFrameworkEntrypoints(output: GeneratedOutput): ValidationViolation[] {
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

function validateLogicQualityForFile(
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

function isBuiltinModule(moduleName: string, framework?: string): boolean {
  if (framework === 'nextjs') {
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
