import type { Response } from "express";
import { z } from "zod";
import {
  type AuthenticatedRequest,
  getAuthenticatedUserId,
} from "../middleware/auth.js";
import { HttpStatus } from "../utils/constants.js";
import { sendSuccess } from "../utils/response.js";

import {
  connectChatToRepo,
  createChatBranch,
  syncChatToGithub,
} from "../services/github.service.js";
import { asyncHandlerWithCustomError } from "../utils/controller.js";

const connectRepoSchema = z.object({
  chatId: z.string().min(1, "chatId is required"),
  repoFullName: z.string().min(1, "repoFullName is required"),
  repoName: z.string().min(1, "repoName is required"),
});

const createBranchSchema = z.object({
  chatId: z.string().min(1, "chatId is required"),
  branchName: z.string().min(1, "branchName is required"),
  baseBranch: z.string().min(1, "baseBranch is required"),
});

const syncRepoSchema = z.object({
  chatId: z.string().min(1, "chatId is required"),
  branch: z.string().min(1, "branch is required"),
  commitMessage: z.string().min(1, "commitMessage is required"),
});

function mapGithubErrorToStatus(error: Error): {
  status: HttpStatus;
  message: string;
} {
  const message = error.message.toLowerCase();
  if (
    message.includes("bad credentials") ||
    message.includes("authentication")
  ) {
    return { status: HttpStatus.UNAUTHORIZED, message: error.message };
  }
  if (
    message.includes("permission denied") ||
    message.includes("permission error") ||
    message.includes("scope")
  ) {
    return { status: HttpStatus.FORBIDDEN, message: error.message };
  }
  if (message.includes("not found")) {
    return { status: HttpStatus.NOT_FOUND, message: error.message };
  }
  if (
    message.includes("invalid") ||
    message.includes("required") ||
    message.includes("validation")
  ) {
    return { status: HttpStatus.BAD_REQUEST, message: error.message };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: error.message };
}

async function connectRepoHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(req);
  const validation = connectRepoSchema.safeParse(req.body);
  if (!validation.success) {
    const message = validation.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new Error(`Validation failed: ${message}`);
  }
  const { chatId, repoFullName, repoName } = validation.data;
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
  const validation = createBranchSchema.safeParse(req.body);
  if (!validation.success) {
    const message = validation.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new Error(`Validation failed: ${message}`);
  }
  const { chatId, branchName, baseBranch } = validation.data;
  await createChatBranch(chatId, userId, branchName, baseBranch);

  sendSuccess(
    res,
    HttpStatus.OK,
    `Branch '${branchName}' created successfully`,
  );
}

async function syncRepoHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(req);
  const validation = syncRepoSchema.safeParse(req.body);
  if (!validation.success) {
    const message = validation.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new Error(`Validation failed: ${message}`);
  }
  const { chatId, branch, commitMessage } = validation.data;
  const result = await syncChatToGithub(chatId, userId, branch, commitMessage);

  sendSuccess(
    res,
    HttpStatus.OK,
    "Changes synced to GitHub successfully",
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
