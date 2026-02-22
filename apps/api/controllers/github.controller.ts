import type { Response } from "express";
import {
  type AuthenticatedRequest,
  getAuthenticatedUserId,
} from "../middleware/auth.js";
import { HttpStatus } from "../utils/constants.js";
import { sendSuccess } from "../utils/response.js";

import {
  connectChatToRepo,
  createChatBranch,
  getChatGithubStatus,
  syncChatToGithub,
} from "../services/github.service.js";
import {
  type ConnectRepoInput,
  type CreateBranchInput,
  type GithubStatusQuery,
  type SyncRepoInput,
} from "../schemas/github.schema.js";
import { asyncHandlerWithCustomError } from "../utils/controller.js";

const GITHUB_ERROR_PATTERNS = {
  unauthorized: ["bad credentials", "authentication"],
  forbidden: ["permission denied", "permission error", "scope"],
  conflict: ["already connected"],
  staleBinding: [
    "previously connected github repository no longer exists",
    "please connect again",
  ],
  notFound: ["not found"],
  badRequest: ["invalid", "required", "validation"],
} as const;

function includesAnyPattern(
  message: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => message.includes(pattern));
}

function mapGithubErrorToStatus(error: Error): {
  status: HttpStatus;
  message: string;
} {
  const message = error.message.toLowerCase();
  if (includesAnyPattern(message, GITHUB_ERROR_PATTERNS.unauthorized)) {
    return { status: HttpStatus.UNAUTHORIZED, message: error.message };
  }
  if (includesAnyPattern(message, GITHUB_ERROR_PATTERNS.forbidden)) {
    return { status: HttpStatus.FORBIDDEN, message: error.message };
  }
  if (includesAnyPattern(message, GITHUB_ERROR_PATTERNS.conflict)) {
    return { status: HttpStatus.CONFLICT, message: error.message };
  }
  if (includesAnyPattern(message, GITHUB_ERROR_PATTERNS.staleBinding)) {
    return { status: HttpStatus.CONFLICT, message: error.message };
  }
  if (includesAnyPattern(message, GITHUB_ERROR_PATTERNS.notFound)) {
    return { status: HttpStatus.NOT_FOUND, message: error.message };
  }
  if (includesAnyPattern(message, GITHUB_ERROR_PATTERNS.badRequest)) {
    return { status: HttpStatus.BAD_REQUEST, message: error.message };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: error.message };
}

async function connectRepoHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(req);
  const { chatId, repoFullName, repoName } = req.body as ConnectRepoInput;
  const result = await connectChatToRepo(
    chatId,
    userId,
    repoFullName,
    repoName,
  );

  sendSuccess(
    res,
    HttpStatus.OK,
    `Repository '${result.repoFullName}' connected successfully`,
    result,
  );
}

async function createBranchHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(req);
  const { chatId, branchName, baseBranch } = req.body as CreateBranchInput;
  const result = await createChatBranch(chatId, userId, branchName, baseBranch);

  sendSuccess(
    res,
    HttpStatus.OK,
    result.existed
      ? `Branch '${branchName}' already exists`
      : `Branch '${branchName}' created successfully`,
    result,
  );
}

async function syncRepoHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(req);
  const { chatId, branch, commitMessage } = req.body as SyncRepoInput;
  const result = await syncChatToGithub(chatId, userId, branch, commitMessage);

  sendSuccess(
    res,
    HttpStatus.OK,
    "Changes synced to GitHub successfully",
    result,
  );
}

async function githubStatusHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(req);
  const { chatId } = req.query as GithubStatusQuery;
  const result = await getChatGithubStatus(chatId, userId);

  sendSuccess(
    res,
    HttpStatus.OK,
    "GitHub repository status fetched successfully",
    result,
  );
}

export const connectRepo = asyncHandlerWithCustomError(
  connectRepoHandler,
  mapGithubErrorToStatus,
);
export const createBranch = asyncHandlerWithCustomError(
  createBranchHandler,
  mapGithubErrorToStatus,
);
export const syncRepo = asyncHandlerWithCustomError(
  syncRepoHandler,
  mapGithubErrorToStatus,
);
export const githubStatus = asyncHandlerWithCustomError(
  githubStatusHandler,
  mapGithubErrorToStatus,
);
