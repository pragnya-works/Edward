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

export const CreateBranchSchema = z.object({
  chatId: nonEmpty,
  branchName,
  baseBranch: branchName.optional().default('main'),
});

export const SyncRepoSchema = z.object({
  chatId: nonEmpty,
  branch: branchName,
  commitMessage: nonEmpty,
});
