import { z } from 'zod';

const nonEmpty = z.string().trim().min(1, 'Value cannot be empty');
const repoFullName = nonEmpty.regex(/^[^/\s]+\/[^/\s]+$/, 'repoFullName must be in owner/repo format');
const repoName = nonEmpty.regex(/^[A-Za-z0-9._-]+$/, 'repoName contains invalid characters');

const branchName = nonEmpty.refine((value) => {
  if (value.startsWith('/') || value.endsWith('/')) return false;
  if (value.includes('..') || value.includes('@{')) return false;
  if (/[~^:?*\s\\[\]]/.test(value)) return false;
  return true;
}, 'Invalid branch name');

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
