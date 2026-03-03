import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubDisconnectReason } from "@edward/shared/constants";

const mocks = vi.hoisted(() => ({
  getChatRepoBinding: vi.fn(),
  clearChatRepoBinding: vi.fn(),
  getRepoSnapshot: vi.fn(),
  parseRepoFullName: vi.fn(),
  getGithubToken: vi.fn(),
  createGithubClient: vi.fn(),
}));

vi.mock("@edward/octokit", () => ({
  createGithubClient: mocks.createGithubClient,
}));

vi.mock("../../services/github/repoBinding.service.js", () => ({
  getChatRepoBinding: mocks.getChatRepoBinding,
  clearChatRepoBinding: mocks.clearChatRepoBinding,
}));

vi.mock("../../services/github/shared.service.js", () => ({
  getRepoSnapshot: mocks.getRepoSnapshot,
  parseRepoFullName: mocks.parseRepoFullName,
}));

vi.mock("../../services/github/token.service.js", () => ({
  getGithubToken: mocks.getGithubToken,
}));

describe("github status service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseRepoFullName.mockReturnValue({ owner: "org", repo: "repo" });
    mocks.getChatRepoBinding.mockResolvedValue({ repoFullName: "org/repo" });
    mocks.getGithubToken.mockResolvedValue("gh-token");
    mocks.createGithubClient.mockReturnValue({});
    mocks.getRepoSnapshot.mockResolvedValue({ canPush: true, defaultBranch: "main" });
    mocks.clearChatRepoBinding.mockResolvedValue(undefined);
  });

  it("returns disconnected state when chat has no repo binding", async () => {
    const { getChatGithubStatus } = await import("../../services/github/status.service.js");

    mocks.getChatRepoBinding.mockResolvedValueOnce({ repoFullName: null });

    const status = await getChatGithubStatus("chat-1", "user-1");

    expect(status.connected).toBe(false);
    expect(status.disconnectedReason).toBe(GithubDisconnectReason.NOT_CONNECTED);
  });

  it("returns auth-missing when token is unavailable", async () => {
    const { getChatGithubStatus } = await import("../../services/github/status.service.js");

    mocks.getGithubToken.mockResolvedValueOnce(null);

    const status = await getChatGithubStatus("chat-1", "user-1");

    expect(status.connected).toBe(true);
    expect(status.canPush).toBe(false);
    expect(status.disconnectedReason).toBe(GithubDisconnectReason.AUTH_MISSING);
  });

  it("clears stale binding when repository no longer exists", async () => {
    const { getChatGithubStatus } = await import("../../services/github/status.service.js");

    mocks.getRepoSnapshot.mockResolvedValueOnce(null);

    const status = await getChatGithubStatus("chat-1", "user-1");

    expect(status.connected).toBe(false);
    expect(status.disconnectedReason).toBe(GithubDisconnectReason.REPO_MISSING);
    expect(mocks.clearChatRepoBinding).toHaveBeenCalledWith("chat-1", "user-1");
  });

  it("returns connected status with repo permissions", async () => {
    const { getChatGithubStatus } = await import("../../services/github/status.service.js");

    const status = await getChatGithubStatus("chat-1", "user-1");

    expect(status.connected).toBe(true);
    expect(status.canPush).toBe(true);
    expect(status.defaultBranch).toBe("main");
    expect(status.disconnectedReason).toBe(GithubDisconnectReason.NONE);
  });
});
