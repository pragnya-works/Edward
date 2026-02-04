import { db, chat, account, eq, and } from '@edward/auth';
import {
  createGithubClient,
  syncFiles,
  createBranch,
  validateRepo,
  getAuthenticatedUser,
  checkRepoPermission,
  createRepo,
  type GithubFile
} from '@edward/octokit';
import { extractFilesFromStream } from './github/sync.utils.js';
import { getActiveSandbox } from './sandbox/lifecycle/provisioning.js';
import { getContainer } from './sandbox/docker.sandbox.js';
import { createBackupArchive } from './sandbox/backup/archive.js';
import { getSandboxState } from './sandbox/state.sandbox.js';
import { logger } from '../utils/logger.js';
import { ensureError } from '../utils/error.js';

function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const parts = fullName.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid repository name format. Use owner/repo');
  }
  return { owner: parts[0], repo: parts[1] };
}

async function getGithubToken(userId: string): Promise<string | null> {
  try {
    const [acc] = await db
      .select({ accessToken: account.accessToken })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'github')))
      .limit(1);

    return acc?.accessToken || null;
  } catch (err) {
    logger.error(ensureError(err), 'getGithubToken database error');
    throw new Error('Failed to retrieve GitHub credentials');
  }
}

export async function syncChatToGithub(
  chatId: string,
  userId: string,
  branch: string,
  commitMessage: string
) {
  const token = await getGithubToken(userId);
  if (!token) throw new Error('User has no GitHub account connected');

  const [chatData] = await db
    .select({ repo: chat.githubRepoFullName })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!chatData || !chatData.repo) throw new Error('Chat is not connected to a GitHub repository');

  const { owner, repo } = parseRepoFullName(chatData.repo);

  const octokit = createGithubClient(token);

  let hasPushAccess = false;
  try {
    hasPushAccess = await checkRepoPermission(octokit, owner, repo, 'push');
  } catch (err) {
    const error = ensureError(err);
    if (error.message.toLowerCase().includes('not found')) {
      throw new Error(`Repository '${chatData.repo}' not found or you do not have access`);
    }
    throw error;
  }
  if (!hasPushAccess) {
    throw new Error(`Permission Denied: You do not have push access to '${chatData.repo}'`);
  }

  const files: GithubFile[] = [];

  const sandboxId = await getActiveSandbox(chatId);
  if (sandboxId) {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) throw new Error('Sandbox state not found');

    const container = getContainer(sandbox.containerId);
    try {
      const { uploadStream, completion } = await createBackupArchive(container);
      const [extractedFiles] = await Promise.all([
        extractFilesFromStream(uploadStream),
        completion,
      ]);
      files.push(...extractedFiles);
    } catch (err) {
      logger.error(ensureError(err), 'Sandbox file extraction failed');
      throw new Error('Failed to extract files from the project sandbox');
    }
  } else {
    logger.info({ chatId, userId }, 'No active sandbox, attempting sync from S3 backup');
    const { isS3Configured } = await import('./storage/config.js');
    const { buildS3Key } = await import('./storage/key.utils.js');
    const { downloadFile } = await import('./storage.service.js');

    if (!isS3Configured()) {
      throw new Error('GitHub sync failed: No active sandbox and S3 storage is not configured');
    }

    const s3Key = buildS3Key(userId, chatId, 'source_backup.tar.gz');
    const backupStream = await downloadFile(s3Key);

    if (!backupStream) {
      throw new Error('GitHub sync failed: No active sandbox or previous backup found to sync');
    }

    try {
      const extractedFiles = await extractFilesFromStream(backupStream);
      files.push(...extractedFiles);
    } catch (err) {
      logger.error(ensureError(err), 'S3 backup extraction failed');
      throw new Error('Failed to extract files from the S3 backup for GitHub sync');
    }
  }

  if (files.length === 0) throw new Error('No source files found to sync');

  try {
    const sha = await syncFiles(octokit, owner, repo, branch, files, commitMessage);
    return { sha, fileCount: files.length };
  } catch (err) {
    const error = ensureError(err);
    logger.error(error, 'GitHub sync operation failed');
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('not found') || lowerMessage.includes('reference does not exist')) {
      throw new Error(`Branch '${branch}' not found in '${chatData.repo}'`);
    }
    throw new Error(`GitHub sync failed: ${error.message}`);
  }
}

export async function createChatBranch(
  chatId: string,
  userId: string,
  branchName: string,
  baseBranch: string = 'main'
) {
  const token = await getGithubToken(userId);
  if (!token) throw new Error('User has no GitHub account connected');

  const [chatData] = await db
    .select({ repo: chat.githubRepoFullName })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!chatData || !chatData.repo) throw new Error('Chat is not connected to a GitHub repository');

  const { owner, repo } = parseRepoFullName(chatData.repo);
  const octokit = createGithubClient(token);

  const hasPushAccess = await checkRepoPermission(octokit, owner, repo, 'push');
  if (!hasPushAccess) {
    throw new Error(`Permission Denied: You do not have permission to create branches in '${chatData.repo}'`);
  }

  try {
    await createBranch(octokit, owner, repo, baseBranch, branchName);
    return { success: true };
  } catch (err) {
    const error = ensureError(err);
    logger.error(error, 'GitHub branch creation failed');
    throw new Error(`Failed to create branch: ${error.message}`);
  }
}

export async function connectChatToRepo(
  chatId: string,
  userId: string,
  repoFullName?: string,
  repoName?: string
) {
  const token = await getGithubToken(userId);
  if (!token) throw new Error('User has no GitHub account connected');

  const octokit = createGithubClient(token);
  let finalRepoFullName = repoFullName;
  const githubUser = await getAuthenticatedUser(octokit);

  if (!finalRepoFullName && repoName) {
    finalRepoFullName = `${githubUser.login}/${repoName}`;
  }

  if (!finalRepoFullName) throw new Error('Repository name is required');

  const { owner, repo } = parseRepoFullName(finalRepoFullName);

  try {
    const exists = await validateRepo(octokit, owner, repo);

    if (!exists) {
      if (owner.toLowerCase() === githubUser.login.toLowerCase()) {
        logger.info({ owner, repo }, 'Repository not found. Attempting to create...');
        try {
          await createRepo(octokit, repo, {
            private: true,
            description: 'Created by Edward AI'
          });
        } catch (err) {
          const createError = ensureError(err);
          const lower = createError.message.toLowerCase();
          if (lower.includes('already exists') || lower.includes('name already exists')) {
            throw new Error("GitHub Permission Error: The repository already exists but cannot be accessed. Please reauthorize with the 'repo' scope.");
          }
          throw createError;
        }
        logger.info({ finalRepoFullName }, 'Repository created successfully');
      } else {
        throw new Error(`Repository '${finalRepoFullName}' not found and cannot be created (owner mismatch)`);
      }
    }

    await db
      .update(chat)
      .set({ githubRepoFullName: finalRepoFullName })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));

    return { success: true, repoFullName: finalRepoFullName, created: !exists };
  } catch (err) {
    const error = ensureError(err);
    if (error.message.includes('Not Found') && error.message.includes('create-a-repository')) {
      throw new Error("GitHub Permission Error: Your account's session does not have the 'repo' scope. Please log out and sign in again to authorize Edward.");
    }
    logger.error(error, 'Failed to connect/create repository');
    throw error;
  }
}
