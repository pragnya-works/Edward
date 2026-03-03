import {
  createBranch,
  createGithubClient,
  createRepo,
  getAuthenticatedUser,
  syncFiles,
} from "@edward/octokit";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import { prepareGithubFilesWithReadme } from "./readme.utils.js";
import {
  clearChatRepoBinding,
  getChatRepoBinding,
  setChatRepoBinding,
} from "./repoBinding.service.js";
import {
  DEFAULT_GITHUB_BASE_BRANCH,
  REPO_MISSING_RECONNECT_MESSAGE,
  getRepoSnapshot,
  isAlreadyExistsError,
  parseRepoFullName,
} from "./shared.service.js";
import { loadFilesForGithubSync } from "./sync.files.js";
import { getGithubToken } from "./token.service.js";

const MISSING_GITHUB_TOKEN_MESSAGE = "User has no GitHub account connected";
type GithubClient = ReturnType<typeof createGithubClient>;
type RepoSnapshot = NonNullable<Awaited<ReturnType<typeof getRepoSnapshot>>>;

interface ConnectedRepoContext {
  chatData: Awaited<ReturnType<typeof getChatRepoBinding>>;
  octokit: GithubClient;
  owner: string;
  repo: string;
  repoSnapshot: RepoSnapshot;
}

async function getGithubClientForUser(userId: string): Promise<GithubClient> {
  const token = await getGithubToken(userId);
  if (!token) {
    throw new Error(MISSING_GITHUB_TOKEN_MESSAGE);
  }

  return createGithubClient(token);
}

async function getConnectedRepoContext(
  chatId: string,
  userId: string,
  permissionMessage: (repoFullName: string) => string,
): Promise<ConnectedRepoContext> {
  const octokit = await getGithubClientForUser(userId);
  const chatData = await getChatRepoBinding(chatId, userId);
  if (!chatData.repoFullName) {
    throw new Error("Chat is not connected to a GitHub repository");
  }

  const { owner, repo } = parseRepoFullName(chatData.repoFullName);
  const repoSnapshot = await getRepoSnapshot(octokit, owner, repo);

  if (!repoSnapshot) {
    await clearChatRepoBinding(chatId, userId);
    throw new Error(REPO_MISSING_RECONNECT_MESSAGE);
  }

  if (!repoSnapshot.canPush) {
    throw new Error(permissionMessage(chatData.repoFullName));
  }

  return {
    chatData,
    octokit,
    owner,
    repo,
    repoSnapshot,
  };
}

export async function syncChatToGithub(
  chatId: string,
  userId: string,
  branch: string,
  commitMessage: string,
): Promise<{
  sha: string;
  fileCount: number;
  noChanges: boolean;
}> {
  const { chatData, octokit, owner, repo } = await getConnectedRepoContext(
    chatId,
    userId,
    (repoFullName) =>
      `Permission Denied: You do not have push access to '${repoFullName}'`,
  );

  const files = await loadFilesForGithubSync(chatId, userId);
  if (files.length === 0) {
    throw new Error("No source files found to sync");
  }

  const readmePrepared = prepareGithubFilesWithReadme(files, { repoName: repo });
  if (readmePrepared.readmeAction !== "kept") {
    logger.info(
      {
        chatId,
        userId,
        repo: chatData.repoFullName,
        readmeAction: readmePrepared.readmeAction,
      },
      "README was generated/enriched before GitHub sync",
    );
  }

  try {
    const syncResult = await syncFiles(
      octokit,
      owner,
      repo,
      branch,
      readmePrepared.files,
      commitMessage,
    );

    return {
      sha: syncResult.sha,
      fileCount: readmePrepared.files.length,
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
): Promise<{
  success: true;
  existed: boolean;
  branchName: string;
  baseBranch: string;
}> {
  const { octokit, owner, repo, repoSnapshot } = await getConnectedRepoContext(
    chatId,
    userId,
    (repoFullName) =>
      `Permission Denied: You do not have permission to create branches in '${repoFullName}'`,
  );

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
): Promise<{
  success: true;
  repoFullName: string;
  created: boolean;
  isPrivate: boolean;
  defaultBranch: string;
  privacyDefaultApplied: boolean;
  privacyEnforced: boolean;
}> {
  const chatData = await getChatRepoBinding(chatId, userId);
  const currentlyConnectedRepo = chatData.repoFullName;

  const octokit = await getGithubClientForUser(userId);
  let finalRepoFullName = repoFullName;
  const githubUser = await getAuthenticatedUser(octokit);

  if (!finalRepoFullName && repoName) {
    finalRepoFullName = `${githubUser.login}/${repoName}`;
  }

  if (!finalRepoFullName) {
    throw new Error("Repository name is required");
  }

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
      if (normalizedOwner !== normalizedUser) {
        throw new Error(
          `Repository '${finalRepoFullName}' not found and cannot be created (owner mismatch)`,
        );
      }

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
          defaultBranch = updatedRepo.default_branch?.trim() || defaultBranch;
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
    } else if (!repoSnapshot.canPush) {
      throw new Error(
        `Permission Denied: You do not have push access to '${finalRepoFullName}'`,
      );
    }

    if (!exists && !isPrivate) {
      throw new Error(
        `Repository '${finalRepoFullName}' could not be confirmed private. Please verify visibility and try again.`,
      );
    }

    await setChatRepoBinding(chatId, userId, finalRepoFullName);

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
