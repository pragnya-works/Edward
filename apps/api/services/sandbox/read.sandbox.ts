import { executeSandboxCommand } from './command.sandbox.js';
import { CONTAINER_WORKDIR } from './docker.sandbox.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('READ_SANDBOX');

const MAX_TOTAL_BYTES = 200 * 1024;
const MAX_FILES = 50;

const EXCLUDED_DIRS = [
  'node_modules', '.next', 'dist', 'build', 'out',
  '.git', '.cache', 'coverage', '.turbo', '.vercel',
];

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss',
  '.html', '.md', '.yml', '.yaml', '.toml', '.env',
  '.mjs', '.cjs', '.svg', '.txt',
]);

const PRIORITY_FILES = [
  // Framework entrypoints
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/globals.css',
  'src/main.tsx',
  'src/App.tsx',
  'src/index.css',

  // Common UI/theme files
  'src/components/ui.tsx',
  'src/components/providers.tsx',
  'src/components/theme-toggle.tsx',
  'src/components/themeToggle.tsx',
  'src/lib/utils.ts',
  'components.json',

  // Tooling/config that affects UI builds
  'next.config.mjs',
  'vite.config.ts',
  'tailwind.config.ts',
  'tailwind.config.js',
  'postcss.config.mjs',
  'postcss.config.js',
  'tsconfig.json',
  'package.json',

  // Vanilla entrypoints
  'index.html',
  'styles.css',
  'script.js',
];

async function readSandboxFile(
  sandboxId: string,
  filePath: string,
): Promise<string> {
  try {
    const result = await executeSandboxCommand(sandboxId, { command: 'cat', args: [filePath] }, { timeout: 5000 });
    return result.stdout ?? '';
  } catch (err) {
    logger.warn({ sandboxId, filePath, err }, 'Failed to read sandbox file');
    return '';
  }
}

export async function readAllProjectFiles(
  sandboxId: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  const excludeArgs = EXCLUDED_DIRS.flatMap((d) => [
    '-path', `*/${d}/*`, '-prune', '-o',
  ]);
  const findArgs = [CONTAINER_WORKDIR, ...excludeArgs, '-type', 'f', '-print'];

  let listOutput: string;
  try {
    const result = await executeSandboxCommand(sandboxId, { command: 'find', args: findArgs }, { timeout: 10000 });
    listOutput = result.stdout ?? '';
  } catch {
    logger.warn({ sandboxId }, 'Failed to list project files');
    return files;
  }

  const allPaths = listOutput
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      const dotIdx = p.lastIndexOf('.');
      return dotIdx !== -1 && TEXT_EXTENSIONS.has(p.slice(dotIdx));
    });

  const toRelPath = (fullPath: string) =>
    fullPath.startsWith(CONTAINER_WORKDIR + '/')
      ? fullPath.slice(CONTAINER_WORKDIR.length + 1)
      : fullPath;

  const relToFull = new Map<string, string>();
  for (const fullPath of allPaths) {
    relToFull.set(toRelPath(fullPath), fullPath);
  }

  const selected: string[] = [];
  for (const rel of PRIORITY_FILES) {
    const full = relToFull.get(rel);
    if (full) selected.push(full);
    if (selected.length >= MAX_FILES) break;
  }

  if (selected.length < MAX_FILES) {
    const remaining = allPaths
      .filter((p) => !selected.includes(p))
      .sort((a, b) => toRelPath(a).localeCompare(toRelPath(b)));
    selected.push(...remaining.slice(0, MAX_FILES - selected.length));
  }

  let totalBytes = 0;

  for (const fullPath of selected) {
    if (totalBytes >= MAX_TOTAL_BYTES) break;

    const content = await readSandboxFile(sandboxId, fullPath);
    if (!content) continue;

    const contentBytes = Buffer.byteLength(content, 'utf8');
    if (totalBytes + contentBytes > MAX_TOTAL_BYTES) continue;

    const relPath = toRelPath(fullPath);

    files.set(relPath, content);
    totalBytes += contentBytes;
  }

  return files;
}

export async function readSpecificFiles(
  sandboxId: string,
  filePaths: string[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  let totalBytes = 0;

  for (const filePath of filePaths) {
    if (totalBytes >= MAX_TOTAL_BYTES) break;

    const content = await readSandboxFile(sandboxId, filePath);
    if (!content) continue;

    const contentBytes = Buffer.byteLength(content, 'utf8');
    if (totalBytes + contentBytes > MAX_TOTAL_BYTES) continue;

    files.set(filePath, content);
    totalBytes += contentBytes;
  }

  return files;
}

export function formatProjectSnapshot(files: Map<string, string>): string {
  if (files.size === 0) return '';
  const sections: string[] = ['CURRENT PROJECT STATE:'];
  for (const [filePath, content] of files) {
    sections.push(`--- FILE: ${filePath} ---\n${content}`);
  }
  return sections.join('\n');
}
