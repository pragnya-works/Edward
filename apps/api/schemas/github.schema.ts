import { z } from 'zod';
import {
  validateGithubBranchName,
  validateGithubRepositoryInput,
  validateGithubRepositoryName,
} from '@edward/shared/github/naming';

const nonEmpty = z.string().trim().min(1, 'Value cannot be empty');

function addValidationIssue(
  ctx: z.RefinementCtx,
  fallbackMessage: string,
  validationMessage: string | null,
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: validationMessage || fallbackMessage,
  });
}

const repoFullName = nonEmpty.superRefine(function validateRepoFullName(
  value,
  ctx,
) {
  const validation = validateGithubRepositoryInput(value);
  const parts = value.split('/');
  if (!validation.valid || parts.length !== 2) {
    addValidationIssue(
      ctx,
      'repoFullName must be in owner/repo format',
      validation.message,
    );
  }
});

const repoName = nonEmpty.superRefine(function validateRepoName(value, ctx) {
  const validation = validateGithubRepositoryName(value);
  if (!validation.valid) {
    addValidationIssue(
      ctx,
      'repoName contains invalid characters',
      validation.message,
    );
  }
});

const branchName = nonEmpty.superRefine(function validateBranchName(value, ctx) {
  const validation = validateGithubBranchName(value);
  if (!validation.valid) {
    addValidationIssue(ctx, 'Invalid branch name', validation.message);
  }
});

export const ConnectRepoSchema = z.object({
  chatId: nonEmpty,
  repoFullName: repoFullName.optional(),
  repoName: repoName.optional(),
}).refine((data) => data.repoFullName || data.repoName, {
  message: 'Either repoFullName (owner/repo) or repoName must be provided',
});
export type ConnectRepoInput = z.infer<typeof ConnectRepoSchema>;

export const CreateBranchSchema = z.object({
  chatId: nonEmpty,
  branchName,
  baseBranch: branchName.optional(),
});
export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;

export const SyncRepoSchema = z.object({
  chatId: nonEmpty,
  branch: branchName,
  commitMessage: nonEmpty,
});
export type SyncRepoInput = z.infer<typeof SyncRepoSchema>;

export const GithubStatusQuerySchema = z.object({
  chatId: nonEmpty,
});
export type GithubStatusQuery = z.infer<typeof GithubStatusQuerySchema>;

export const ConnectRepoRequestSchema = z.object({
  body: ConnectRepoSchema,
});

export const CreateBranchRequestSchema = z.object({
  body: CreateBranchSchema,
});

export const SyncRepoRequestSchema = z.object({
  body: SyncRepoSchema,
});

export const GithubStatusRequestSchema = z.object({
  query: GithubStatusQuerySchema,
});
