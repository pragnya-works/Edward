import type { PatternRequirement } from './postgenValidator.types.js';

export const REQUIRED_ENTRY_POINTS: Record<string, string[]> = {
  nextjs: ['src/app/layout.tsx', 'src/app/page.tsx'],
  'vite-react': ['src/main.tsx', 'src/App.tsx'],
  vanilla: ['index.html'],
};

export const REQUIRED_CSS_IMPORTS: Record<string, { file: string; importPattern: RegExp }> = {
  nextjs: { file: 'src/app/layout.tsx', importPattern: /import\s+['"]\.\/globals\.css['"]/ },
  'vite-react': { file: 'src/main.tsx', importPattern: /import\s+['"]\.\/index\.css['"]/ },
};

export const REQUIRED_GENERATE_PROJECT_FILES = ['README.md'] as const;
export const REQUIRED_GENERATE_PROJECT_FILES_BY_FRAMEWORK: Record<string, readonly string[]> = {};
export const MAX_GENERATED_FILE_LINES = 200;
export const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx)$/i;
export const MARKDOWN_FENCE_PATTERN = /^```/m;
export const RELATIVE_IMPORT_PATTERN = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
export const PACKAGE_IMPORT_PATTERN = /(?:import|from)\s+['"]([^./][^'"]*)['"]/g;
export const EMPTY_ROOT_COMPONENT_PATTERN =
  /export\s+default\s+function[\s\S]*?return\s+(?:null|<>\s*<\/>|<React\.Fragment>\s*<\/React\.Fragment>)\s*;?/m;
export const PLACEHOLDER_PATTERN =
  /\b(?:FIXME|TBD)\b|lorem ipsum|your content here|replace with your/i;
export const COMMENT_STUB_PATTERN =
  /(?:^|[^\S\r\n])(?:\/\/\s*(?:TODO|implement|add logic|add here|placeholder|stub|coming soon)\b|\/\*[\s\S]*?\b(?:TODO|implement|add logic|add here|placeholder|stub|coming soon)\b[\s\S]*?\*\/)/im;
export const SAMPLE_CONTENT_PATTERN =
  /\b(?:Sample Product|Product \d+|My Project \d+|\[Your Name\]|\[Company Name\])\b/i;
export const EMPTY_HANDLER_PATTERN =
  /\b(?:on[A-Z][A-Za-z0-9_]*)\s*=\s*\{\s*(?:\(\s*\))?\s*=>\s*\{\s*\}\s*\}|const\s+[a-z][A-Za-z0-9_]*\s*=\s*\(\s*\)\s*=>\s*\{\s*\}/;
export const INVALID_ZUSTAND_DEFAULT_IMPORT_PATTERN =
  /^\s*import\s+[A-Za-z_$][\w$]*\s*(?:,\s*\{[^}]*\})?\s+from\s+["']zustand["'];?/m;
export const LOCAL_FILE_EXTENSIONS = [
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
export const NEXT_BUILTIN_MODULES = new Set([
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

export const EDWARD_FAVICON_ASSET_BASE = 'https://assets.pragnyaa.in/home/favicon_io';

export const NEXT_REQUIRED_BRANDING_PATTERNS: PatternRequirement[] = [
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
export const NEXT_REQUIRED_SEO_PATTERNS: PatternRequirement[] = [
  { pattern: /\bmetadataBase\b/, label: 'metadataBase' },
  { pattern: /\btitle\s*:/, label: 'title' },
  { pattern: /\bdescription\s*:/, label: 'description' },
  { pattern: /\balternates\s*:/, label: 'alternates' },
  { pattern: /\bcanonical\s*:/, label: 'alternates.canonical' },
  { pattern: /\bopenGraph\s*:/, label: 'openGraph' },
  { pattern: /\btwitter\s*:/, label: 'twitter' },
];
export const HTML_REQUIRED_BRANDING_PATTERNS: PatternRequirement[] = [
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
export const HTML_REQUIRED_SEO_PATTERNS: PatternRequirement[] = [
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
export const HTML_CANONICAL_LINK_PATTERN =
  /<link[^>]+rel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/i;
export const HTML_CANONICAL_HREF_PATTERN = /\bhref=["']([^"']+)["']/i;
export const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;

export const IMPORT_TO_PACKAGE: Record<string, string> = {
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
