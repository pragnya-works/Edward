import { Octokit } from 'octokit';

export interface GithubFile {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

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

export async function validateRepo(octokit: Octokit, owner: string, repo: string): Promise<boolean> {
  try {
    await octokit.rest.repos.get({ owner, repo });
    return true;
  } catch (error) {
    const status = getRequestStatus(error);
    if (status === 404) return false;
    throw error;
  }
}

export async function checkRepoPermission(
  octokit: Octokit,
  owner: string,
  repo: string,
  permission: 'push' | 'pull' | 'admin' = 'push'
): Promise<boolean> {
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    const permissions = data.permissions;
    if (!permissions) return false;
    return permissions[permission] === true;
  } catch (error) {
    const status = getRequestStatus(error);
    if (status === 404) {
      throw new Error('Repository not found or you do not have access');
    }
    if (status === 401 || status === 403) {
      throw new Error('Permission Denied: GitHub token lacks required repository access');
    }
    throw error;
  }
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
): Promise<string> {
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

  const localPaths = new Set(files.map((file) => file.path));
  const localTopLevels = new Set(
    files
      .map((file) => file.path.split('/')[0])
      .filter((segment) => segment && segment.length > 0)
  );
  const preservationPatterns = [
    /^\.github\//,
    /^\.vscode\//,
    /^\.git/,
    /^\.gitignore$/i,
    /^\.gitattributes$/i,
    /^README\.md$/i,
    /^LICENSE/i
  ];

  const deleteItems = currentTree.tree
    .filter(item => {
      if (item.type !== 'blob' || !item.path) return false;
      if (localPaths.has(item.path)) return false;
      const topLevel = item.path.split('/')[0];
      if (!localTopLevels.has(topLevel)) return false;
      const isPreserved = preservationPatterns.some(pattern => pattern.test(item.path!));
      return !isPreserved;
    })
    .map(item => ({
      path: item.path!,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: null,
    }));

  const treeItems = await Promise.all(
    files.map(async (file) => {
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
    })
  );

  const { data: treeData } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: [...treeItems, ...deleteItems],
  });

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
  });

  return newCommitData.sha;
}
