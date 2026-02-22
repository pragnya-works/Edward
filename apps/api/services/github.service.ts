import { db, chat, account, eq, and } from "@edward/auth";
import { GithubDisconnectReason } from "@edward/shared/constants";
import {
  createGithubClient,
  syncFiles,
  createBranch,
  getAuthenticatedUser,
  createRepo,
  type GithubFile,
} from "@edward/octokit";
import { extractFilesFromStream } from "./github/sync.utils.js";
import { getActiveSandbox } from "./sandbox/lifecycle/provisioning.js";
import { getContainer } from "./sandbox/docker.sandbox.js";
import { createBackupArchive } from "./sandbox/backup/archive.js";
import { getSandboxState } from "./sandbox/state.sandbox.js";
import { logger } from "../utils/logger.js";
import { ensureError } from "../utils/error.js";
import { decryptSecret, encryptSecret, isSecretEnvelope } from "../utils/secretEnvelope.js";

const GITHUB_PROVIDER_ID = "github";
const DEFAULT_GITHUB_BASE_BRANCH = "main";
const REPO_MISSING_RECONNECT_MESSAGE =
  "Previously connected GitHub repository no longer exists or access was removed. Please connect again.";

function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const parts = fullName.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid repository name format. Use owner/repo");
  }
  return { owner: parts[0], repo: parts[1] };
}

function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") {
      return status;
    }
  }

  return undefined;
}

interface RepoSnapshot {
  isPrivate: boolean;
  canPush: boolean;
  defaultBranch: string;
}

async function getRepoSnapshot(
  octokit: ReturnType<typeof createGithubClient>,
  owner: string,
  repo: string,
): Promise<RepoSnapshot | null> {
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return {
      isPrivate: data.private === true,
      canPush: data.permissions?.push === true,
      defaultBranch:
        data.default_branch?.trim() || DEFAULT_GITHUB_BASE_BRANCH,
    };
  } catch (error) {
    if (getErrorStatus(error) === 404) {
      return null;
    }
    throw error;
  }
}

function isAlreadyExistsError(error: Error): boolean {
  const lower = error.message.toLowerCase();
  return lower.includes("already exists") || lower.includes("reference already exists");
}

interface ChatRepoBinding {
  chatId: string;
  repoFullName: string | null;
}

async function getChatRepoBinding(
  chatId: string,
  userId: string,
): Promise<ChatRepoBinding> {
  const [chatData] = await db
    .select({ chatId: chat.id, repoFullName: chat.githubRepoFullName })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!chatData) {
    throw new Error(
      "Chat not found or you do not have permission to access it",
    );
  }

  return chatData;
}

async function clearChatRepoBinding(chatId: string, userId: string): Promise<void> {
  await db
    .update(chat)
    .set({ githubRepoFullName: null })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

async function getGithubToken(userId: string): Promise<string | null> {
  try {
    const [acc] = await db
      .select({ id: account.id, accessToken: account.accessToken })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, GITHUB_PROVIDER_ID)))
      .limit(1);

    if (!acc?.accessToken) {
      return null;
    }

    const token = decryptSecret(acc.accessToken);

    if (!isSecretEnvelope(acc.accessToken)) {
      const encryptedToken = encryptSecret(token);
      await db
        .update(account)
        .set({ accessToken: encryptedToken, updatedAt: new Date() })
        .where(eq(account.id, acc.id))
        .catch((migrationError) => {
          logger.warn(
            { migrationError, userId },
            "GitHub token encryption migration failed (non-fatal)",
          );
        });
    }

    return token;
  } catch (err) {
    logger.error(ensureError(err), "getGithubToken database error");
    throw new Error("Failed to retrieve GitHub credentials");
  }
}

export async function syncChatToGithub(
  chatId: string,
  userId: string,
  branch: string,
  commitMessage: string,
) {
  const token = await getGithubToken(userId);
  if (!token) throw new Error("User has no GitHub account connected");

  const chatData = await getChatRepoBinding(chatId, userId);

  if (!chatData.repoFullName)
    throw new Error("Chat is not connected to a GitHub repository");

  const { owner, repo } = parseRepoFullName(chatData.repoFullName);

  const octokit = createGithubClient(token);
  const repoSnapshot = await getRepoSnapshot(octokit, owner, repo);
  if (!repoSnapshot) {
    await clearChatRepoBinding(chatId, userId);
    throw new Error(REPO_MISSING_RECONNECT_MESSAGE);
  }

  if (!repoSnapshot.canPush) {
    throw new Error(
      `Permission Denied: You do not have push access to '${chatData.repoFullName}'`,
    );
  }

  const files: GithubFile[] = [];

  const sandboxId = await getActiveSandbox(chatId);
  if (sandboxId) {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) throw new Error("Sandbox state not found");

    const container = getContainer(sandbox.containerId);
    try {
      const { uploadStream, completion } = await createBackupArchive(container);
      const [extractedFiles] = await Promise.all([
        extractFilesFromStream(uploadStream),
        completion,
      ]);
      files.push(...extractedFiles);
    } catch (err) {
      logger.error(ensureError(err), "Sandbox file extraction failed");
      throw new Error("Failed to extract files from the project sandbox");
    }
  } else {
    logger.info(
      { chatId, userId },
      "No active sandbox, attempting sync from S3 backup",
    );
    const { isS3Configured } = await import("./storage/config.js");
    const { buildS3Key } = await import("./storage/key.utils.js");
    const { downloadFile } = await import("./storage.service.js");

    if (!isS3Configured()) {
      throw new Error(
        "GitHub sync failed: No active sandbox and S3 storage is not configured",
      );
    }

    const s3Key = buildS3Key(userId, chatId, "source_backup.tar.gz");
    const backupStream = await downloadFile(s3Key);

    if (!backupStream) {
      throw new Error(
        "GitHub sync failed: No active sandbox or previous backup found to sync",
      );
    }

    try {
      const extractedFiles = await extractFilesFromStream(backupStream);
      files.push(...extractedFiles);
    } catch (err) {
      logger.error(ensureError(err), "S3 backup extraction failed");
      throw new Error(
        "Failed to extract files from the S3 backup for GitHub sync",
      );
    }
  }

  if (files.length === 0) throw new Error("No source files found to sync");

  try {
    const syncResult = await syncFiles(
      octokit,
      owner,
      repo,
      branch,
      files,
      commitMessage,
    );
    return {
      sha: syncResult.sha,
      fileCount: files.length,
      noChanges: !syncResult.changed,
    };
  } catch (err) {
    const error = ensureError(err);
    logger.error(error, "GitHub sync operation failed");
    const lowerMessage = error.message.toLowerCase();
    if (
      lowerMessage.includes("not found") ||
      lowerMessage.includes("reference does not exist")
    ) {
      throw new Error(`Branch '${branch}' not found in '${chatData.repoFullName}'`);
    }
    throw new Error(`GitHub sync failed: ${error.message}`);
  }
}

export async function createChatBranch(
  chatId: string,
  userId: string,
  branchName: string,
  baseBranch?: string,
) {
  const token = await getGithubToken(userId);
  if (!token) throw new Error("User has no GitHub account connected");

  const chatData = await getChatRepoBinding(chatId, userId);

  if (!chatData.repoFullName)
    throw new Error("Chat is not connected to a GitHub repository");

  const { owner, repo } = parseRepoFullName(chatData.repoFullName);
  const octokit = createGithubClient(token);
  const repoSnapshot = await getRepoSnapshot(octokit, owner, repo);
  if (!repoSnapshot) {
    await clearChatRepoBinding(chatId, userId);
    throw new Error(REPO_MISSING_RECONNECT_MESSAGE);
  }
  if (!repoSnapshot.canPush) {
    throw new Error(
      `Permission Denied: You do not have permission to create branches in '${chatData.repoFullName}'`,
    );
  }

  const normalizedBaseBranch =
    baseBranch?.trim() ||
    repoSnapshot.defaultBranch ||
    DEFAULT_GITHUB_BASE_BRANCH;

  try {
    await createBranch(
      octokit,
      owner,
      repo,
      normalizedBaseBranch,
      branchName,
    );
    return {
      success: true,
      existed: false,
      branchName,
      baseBranch: normalizedBaseBranch,
    };
  } catch (err) {
    const error = ensureError(err);
    if (isAlreadyExistsError(error)) {
      return {
        success: true,
        existed: true,
        branchName,
        baseBranch: normalizedBaseBranch,
      };
    }
    logger.error(error, "GitHub branch creation failed");
    throw new Error(`Failed to create branch: ${error.message}`);
  }
}

export async function connectChatToRepo(
  chatId: string,
  userId: string,
  repoFullName?: string,
  repoName?: string,
) {
  const chatData = await getChatRepoBinding(chatId, userId);
  const currentlyConnectedRepo = chatData.repoFullName;

  const token = await getGithubToken(userId);
  if (!token) throw new Error("User has no GitHub account connected");

  const octokit = createGithubClient(token);
  let finalRepoFullName = repoFullName;
  const githubUser = await getAuthenticatedUser(octokit);

  if (!finalRepoFullName && repoName) {
    finalRepoFullName = `${githubUser.login}/${repoName}`;
  }

  if (!finalRepoFullName) throw new Error("Repository name is required");

  if (
    currentlyConnectedRepo &&
    currentlyConnectedRepo.toLowerCase() !== finalRepoFullName.toLowerCase()
  ) {
    throw new Error(
      `Chat is already connected to '${currentlyConnectedRepo}'. Disconnect is required before changing repository.`,
    );
  }

  const { owner, repo } = parseRepoFullName(finalRepoFullName);
  const normalizedOwner = owner.toLowerCase();
  const normalizedUser = githubUser.login.toLowerCase();

  try {
    const repoSnapshot = await getRepoSnapshot(octokit, owner, repo);
    const exists = repoSnapshot !== null;
    let isPrivate = repoSnapshot?.isPrivate === true;
    let defaultBranch = repoSnapshot?.defaultBranch || DEFAULT_GITHUB_BASE_BRANCH;
    let privacyEnforced = false;

    if (!exists) {
      if (normalizedOwner === normalizedUser) {
        logger.info(
          { owner, repo },
          "Repository not found. Attempting to create...",
        );
        try {
          const createdRepo = await createRepo(octokit, repo, {
            private: true,
            description: "Created by Edward AI",
          });
          isPrivate = createdRepo.private === true;
          defaultBranch =
            createdRepo.default_branch?.trim() || DEFAULT_GITHUB_BASE_BRANCH;
          if (!isPrivate) {
            const { data: updatedRepo } = await octokit.rest.repos.update({
              owner,
              repo,
              private: true,
            });
            isPrivate = updatedRepo.private === true;
            privacyEnforced = isPrivate;
            defaultBranch =
              updatedRepo.default_branch?.trim() || defaultBranch;
          }
        } catch (err) {
          const createError = ensureError(err);
          const lower = createError.message.toLowerCase();
          if (
            lower.includes("already exists") ||
            lower.includes("name already exists")
          ) {
            throw new Error(
              "GitHub Permission Error: The repository already exists but cannot be accessed. Please reauthorize with the 'repo' scope.",
            );
          }
          throw createError;
        }
        logger.info({ finalRepoFullName }, "Repository created successfully");
      } else {
        throw new Error(
          `Repository '${finalRepoFullName}' not found and cannot be created (owner mismatch)`,
        );
      }
    } else {
      if (!repoSnapshot.canPush) {
        throw new Error(
          `Permission Denied: You do not have push access to '${finalRepoFullName}'`,
        );
      }
      isPrivate = repoSnapshot.isPrivate;
    }

    await db
      .update(chat)
      .set({ githubRepoFullName: finalRepoFullName })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));

    return {
      success: true,
      repoFullName: finalRepoFullName,
      created: !exists,
      isPrivate,
      defaultBranch,
      privacyDefaultApplied: !exists,
      privacyEnforced,
    };
  } catch (err) {
    const error = ensureError(err);
    if (
      error.message.includes("Not Found") &&
      error.message.includes("create-a-repository")
    ) {
      throw new Error(
        "GitHub Permission Error: Your account's session does not have the 'repo' scope. Please log out and sign in again to authorize Edward.",
      );
    }
    logger.error(error, "Failed to connect/create repository");
    throw error;
  }
}

export async function getChatGithubStatus(chatId: string, userId: string) {
  const chatData = await getChatRepoBinding(chatId, userId);
  if (!chatData.repoFullName) {
    return {
      connected: false,
      repoFullName: null,
      repoExists: false,
      canPush: false,
      disconnectedReason: GithubDisconnectReason.NOT_CONNECTED,
      defaultBranch: null,
    };
  }

  const token = await getGithubToken(userId);
  if (!token) {
    return {
      connected: true,
      repoFullName: chatData.repoFullName,
      repoExists: true,
      canPush: false,
      disconnectedReason: GithubDisconnectReason.AUTH_MISSING,
      defaultBranch: null,
    };
  }

  const octokit = createGithubClient(token);
  const { owner, repo } = parseRepoFullName(chatData.repoFullName);
  const repoSnapshot = await getRepoSnapshot(octokit, owner, repo);
  if (!repoSnapshot) {
    await clearChatRepoBinding(chatId, userId);
    return {
      connected: false,
      repoFullName: null,
      repoExists: false,
      canPush: false,
      disconnectedReason: GithubDisconnectReason.REPO_MISSING,
      defaultBranch: null,
    };
  }

  return {
    connected: true,
    repoFullName: chatData.repoFullName,
    repoExists: true,
    canPush: repoSnapshot.canPush,
    disconnectedReason: GithubDisconnectReason.NONE,
    defaultBranch: repoSnapshot.defaultBranch,
  };
}
