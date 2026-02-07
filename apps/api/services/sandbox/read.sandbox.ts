import { executeSandboxCommand } from './command.sandbox.js';
import { CONTAINER_WORKDIR } from './docker.sandbox.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('READ_SANDBOX');

const MAX_TOTAL_BYTES = 200 * 1024; // 200KB
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
    })
    .slice(0, MAX_FILES);

  let totalBytes = 0;

  for (const fullPath of allPaths) {
    if (totalBytes >= MAX_TOTAL_BYTES) break;

    const content = await readSandboxFile(sandboxId, fullPath);
    if (!content) continue;

    const contentBytes = Buffer.byteLength(content, 'utf8');
    if (totalBytes + contentBytes > MAX_TOTAL_BYTES) continue;

    const relPath = fullPath.startsWith(CONTAINER_WORKDIR + '/')
      ? fullPath.slice(CONTAINER_WORKDIR.length + 1)
      : fullPath;

    files.set(relPath, content);
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
