import type { Response } from 'express';
import { type AuthenticatedRequest, getAuthenticatedUserId } from '../middleware/auth.js';
import {
    ConnectRepoSchema,
    CreateBranchSchema,
    SyncRepoSchema,
} from '../schemas/github.schema.js';
import { HttpStatus } from '../utils/constants.js';
import { sendError, sendSuccess } from '../utils/response.js';
import { ensureError } from '../utils/error.js';
import { logger } from '../utils/logger.js';
import { connectChatToRepo, createChatBranch, syncChatToGithub } from '../services/github.service.js';

function mapGithubErrorToStatus(message: string): number {
    const lower = message.toLowerCase();
    if (lower.includes('bad credentials') || lower.includes('authentication')) {
        return HttpStatus.UNAUTHORIZED;
    }
    if (lower.includes('permission denied') || lower.includes('permission error') || lower.includes('scope')) {
        return HttpStatus.FORBIDDEN;
    }
    if (lower.includes('not found')) {
        return HttpStatus.NOT_FOUND;
    }
    if (lower.includes('invalid') || lower.includes('required') || lower.includes('validation')) {
        return HttpStatus.BAD_REQUEST;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
}

export async function connectRepo(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
        const userId = getAuthenticatedUserId(req);
        const validated = ConnectRepoSchema.safeParse(req.body);

        if (!validated.success) {
            sendError(res, HttpStatus.BAD_REQUEST, validated.error.errors[0]?.message || 'Validation error');
            return;
        }

        const { chatId, repoFullName, repoName } = validated.data;
        const result = await connectChatToRepo(chatId, userId, repoFullName, repoName);

        sendSuccess(res, HttpStatus.OK, `Repository '${result.repoFullName}' connected successfully`, result);
    } catch (err) {
        const error = ensureError(err);
        logger.error(error, 'connectRepo error');
        sendError(res, mapGithubErrorToStatus(error.message), error.message);
    }
}

export async function createBranch(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
        const userId = getAuthenticatedUserId(req);
        const validated = CreateBranchSchema.safeParse(req.body);

        if (!validated.success) {
            sendError(res, HttpStatus.BAD_REQUEST, validated.error.errors[0]?.message || 'Validation error');
            return;
        }

        const { chatId, branchName, baseBranch } = validated.data;
        await createChatBranch(chatId, userId, branchName, baseBranch);

        sendSuccess(res, HttpStatus.OK, `Branch '${branchName}' created successfully`);
    } catch (err) {
        const error = ensureError(err);
        logger.error(error, 'createBranch error');
        sendError(res, mapGithubErrorToStatus(error.message), error.message);
    }
}

export async function syncRepo(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
        const userId = getAuthenticatedUserId(req);
        const validated = SyncRepoSchema.safeParse(req.body);

        if (!validated.success) {
            sendError(res, HttpStatus.BAD_REQUEST, validated.error.errors[0]?.message || 'Validation error');
            return;
        }

        const { chatId, branch, commitMessage } = validated.data;
        const result = await syncChatToGithub(chatId, userId, branch, commitMessage);

        sendSuccess(res, HttpStatus.OK, 'Changes synced to GitHub successfully', result);
    } catch (err) {
        const error = ensureError(err);
        logger.error(error, 'syncRepo error');
        sendError(res, mapGithubErrorToStatus(error.message), error.message);
    }
}
