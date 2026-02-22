import { GithubDisconnectReason } from "@edward/shared/constants";

export const STORAGE_KEY_PREFIX = "edward:github-integration:";
export const DEFAULT_BASE_BRANCH = "main";
export const REPO_DISCONNECTED_DESCRIPTION =
  "Previously connected repository was deleted or access was revoked. Connect again to continue.";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildDefaultRepoName(
  projectName: string | null,
  chatId: string,
): string {
  const fromProject = projectName ? slugify(projectName) : "";
  if (fromProject) {
    return fromProject.slice(0, 64);
  }
  const chatSuffix = chatId.slice(0, 8) || "workspace";
  return `edward-${chatSuffix}`;
}

export function buildDefaultBranchName(chatId: string): string {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const chatSuffix = chatId.slice(0, 8) || "workspace";
  return `edward/${chatSuffix}-${datePart}`;
}

export function buildDefaultCommitMessage(projectName: string | null): string {
  const normalized = projectName ? slugify(projectName) : "project";
  return `chore: sync ${normalized || "project"} from edward`;
}

export function normalizeRepoInput(rawValue: string): string {
  return rawValue
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/g, "");
}

export function normalizeChatId(rawValue: string | null | undefined): string {
  if (!rawValue) return "";
  const normalized = rawValue.trim();
  if (!normalized) return "";
  if (normalized === "undefined" || normalized === "null") return "";
  return normalized;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "GitHub request failed. Please retry.";
}

export function getGithubToastId(chatId: string): string {
  return `github-integration-${chatId || "unknown"}`;
}

export function isRepoMissingDisconnect(
  reason: GithubDisconnectReason,
): boolean {
  return reason === GithubDisconnectReason.REPO_MISSING;
}
