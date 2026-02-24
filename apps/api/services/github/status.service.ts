import { GithubDisconnectReason } from "@edward/shared/constants";
import { createGithubClient } from "@edward/octokit";
import {
  clearChatRepoBinding,
  getChatRepoBinding,
} from "./repoBinding.service.js";
import { getRepoSnapshot, parseRepoFullName } from "./shared.service.js";
import { getGithubToken } from "./token.service.js";

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
