import crypto from 'node:crypto';
import { Octokit } from 'octokit';

export interface GithubFile {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export interface SyncFilesResult {
  sha: string;
  changed: boolean;
}

interface SyncManifest {
  version: 1;
  managedPaths: string[];
}

const SYNC_MANIFEST_PATH = '.edward-sync-manifest.json';
const MAX_BLOB_UPLOAD_CONCURRENCY = 12;

export function createGithubClient(token: string): Octokit {
  return new Octokit({ auth: token });
}

function getRequestStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: number }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

export async function getAuthenticatedUser(octokit: Octokit) {
  const { data } = await octokit.rest.users.getAuthenticated();
  return data;
}

export async function createRepo(
  octokit: Octokit,
  name: string,
  options: { private?: boolean; description?: string } = {}
) {
  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name,
    private: options.private ?? true,
    description: options.description,
    auto_init: true,
  });
  return data;
}

async function getBranch(octokit: Octokit, owner: string, repo: string, branch: string) {
  try {
    const { data } = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch,
    });
    return data;
  } catch {
    return null;
  }
}

function normalizeRepoPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^(\.\/)+/, '');
  if (!normalized) return null;
  if (normalized === '.' || normalized.includes('../') || normalized.startsWith('..')) {
    return null;
  }
  return normalized;
}

function toFileBuffer(file: GithubFile): Buffer {
  return file.encoding === 'base64'
    ? Buffer.from(file.content, 'base64')
    : Buffer.from(file.content, 'utf8');
}

function computeGitBlobSha(content: Buffer): string {
  const header = Buffer.from(`blob ${content.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(content).digest('hex');
}

function encodeManifest(managedPaths: string[]): string {
  const payload: SyncManifest = {
    version: 1,
    managedPaths: [...managedPaths].sort(),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function parseManifest(content: string): Set<string> {
  try {
    const parsed = JSON.parse(content) as Partial<SyncManifest>;
    if (!Array.isArray(parsed.managedPaths)) return new Set<string>();
    const paths = parsed.managedPaths
      .filter((value): value is string => typeof value === 'string')
      .map((value) => normalizeRepoPath(value))
      .filter((value): value is string => Boolean(value) && value !== SYNC_MANIFEST_PATH);
    return new Set(paths);
  } catch {
    return new Set<string>();
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: effectiveLimit }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]!);
      }
    }),
  );

  return results;
}

async function readManifestFromBlob(
  octokit: Octokit,
  owner: string,
  repo: string,
  blobSha: string | undefined,
): Promise<Set<string>> {
  if (!blobSha) return new Set<string>();

  try {
    const { data } = await octokit.rest.git.getBlob({
      owner,
      repo,
      file_sha: blobSha,
    });
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return parseManifest(content);
  } catch {
    return new Set<string>();
  }
}

export async function createBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseBranch: string,
  newBranch: string
) {
  const base = await getBranch(octokit, owner, repo, baseBranch);
  if (!base) {
    throw new Error(`Base branch ${baseBranch} not found`);
  }

  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${newBranch}`,
    sha: base.commit.sha,
  });
}

export async function syncFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  files: GithubFile[],
  message: string
): Promise<SyncFilesResult> {
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const currentSha = refData.object.sha;

  const { data: commitData } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: currentSha,
  });
  const baseTreeSha = commitData.tree.sha;

  const { data: currentTree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: baseTreeSha,
    recursive: 'true',
  });

  const remoteBlobShaByPath = new Map<string, string>();
  for (const entry of currentTree.tree) {
    if (entry.type !== 'blob' || !entry.path || !entry.sha) continue;
    remoteBlobShaByPath.set(entry.path, entry.sha);
  }

  const dedupedLocalFileByPath = new Map<string, GithubFile>();
  for (const file of files) {
    const normalizedPath = normalizeRepoPath(file.path);
    if (!normalizedPath) {
      throw new Error(`Invalid repository path: ${file.path}`);
    }
    dedupedLocalFileByPath.set(normalizedPath, { ...file, path: normalizedPath });
  }

  const localPaths = new Set(dedupedLocalFileByPath.keys());
  if (localPaths.has(SYNC_MANIFEST_PATH)) {
    throw new Error(`Path '${SYNC_MANIFEST_PATH}' is reserved for Edward sync metadata`);
  }
  const manifestPaths = Array.from(localPaths).sort();

  const previousManagedPaths = await readManifestFromBlob(
    octokit,
    owner,
    repo,
    remoteBlobShaByPath.get(SYNC_MANIFEST_PATH),
  );

  const deleteItems = Array.from(previousManagedPaths)
    .filter((path) => !localPaths.has(path) && remoteBlobShaByPath.has(path))
    .map((path) => ({
      path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: null,
    }));

  const changedFiles = Array.from(dedupedLocalFileByPath.values()).filter((file) => {
    const remoteSha = remoteBlobShaByPath.get(file.path);
    if (!remoteSha) return true;
    return computeGitBlobSha(toFileBuffer(file)) !== remoteSha;
  });

  const treeItems = await mapWithConcurrency(
    changedFiles,
    MAX_BLOB_UPLOAD_CONCURRENCY,
    async (file) => {
      const { data: blobData } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: file.encoding || 'utf-8',
      });

      return {
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blobData.sha,
      };
    },
  );

  const manifestContent = encodeManifest(manifestPaths);
  const manifestSha = computeGitBlobSha(Buffer.from(manifestContent, 'utf8'));
  if (remoteBlobShaByPath.get(SYNC_MANIFEST_PATH) !== manifestSha) {
    const { data: manifestBlob } = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: manifestContent,
      encoding: 'utf-8',
    });
    treeItems.push({
      path: SYNC_MANIFEST_PATH,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: manifestBlob.sha,
    });
  }

  if (treeItems.length === 0 && deleteItems.length === 0) {
    return { sha: currentSha, changed: false };
  }

  const { data: treeData } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: [...treeItems, ...deleteItems],
  });

  if (treeData.sha === baseTreeSha) {
    return { sha: currentSha, changed: false };
  }

  const { data: newCommitData } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: treeData.sha,
    parents: [currentSha],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommitData.sha,
    force: false,
  }).catch((error: unknown) => {
    const status = getRequestStatus(error);
    if (status === 409 || status === 422) {
      throw new Error(
        'Branch changed on GitHub during sync. Please refresh the branch and retry.',
      );
    }
    throw error;
  });

  return { sha: newCommitData.sha, changed: true };
}
