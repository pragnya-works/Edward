import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectChatToRepo } from "../../services/github/sync.service.js";

const mocks = vi.hoisted(() => ({
  getChatRepoBindingMock: vi.fn(),
  setChatRepoBindingMock: vi.fn(),
  getGithubTokenMock: vi.fn(),
  getRepoSnapshotMock: vi.fn(),
  createRepoMock: vi.fn(),
  getAuthenticatedUserMock: vi.fn(),
  updateRepoMock: vi.fn(),
}));

vi.mock("../../services/github/repoBinding.service.js", () => ({
  clearChatRepoBinding: vi.fn(),
  getChatRepoBinding: mocks.getChatRepoBindingMock,
  setChatRepoBinding: mocks.setChatRepoBindingMock,
}));

vi.mock("../../services/github/token.service.js", () => ({
  getGithubToken: mocks.getGithubTokenMock,
}));

vi.mock("../../services/github/shared.service.js", () => ({
  DEFAULT_GITHUB_BASE_BRANCH: "main",
  REPO_MISSING_RECONNECT_MESSAGE: "missing",
  isAlreadyExistsError: vi.fn().mockReturnValue(false),
  getRepoSnapshot: mocks.getRepoSnapshotMock,
  parseRepoFullName: (fullName: string) => {
    const [owner = "", repo = ""] = fullName.split("/");
    return { owner, repo };
  },
}));

vi.mock("@edward/octokit", () => ({
  createBranch: vi.fn(),
  createGithubClient: vi.fn(() => ({
    rest: {
      repos: {
        update: mocks.updateRepoMock,
      },
    },
  })),
  createRepo: mocks.createRepoMock,
  getAuthenticatedUser: mocks.getAuthenticatedUserMock,
  syncFiles: vi.fn(),
}));

describe("connectChatToRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChatRepoBindingMock.mockResolvedValue({ repoFullName: null });
    mocks.getGithubTokenMock.mockResolvedValue("token");
    mocks.getAuthenticatedUserMock.mockResolvedValue({ login: "alice" });
    mocks.getRepoSnapshotMock.mockResolvedValue(null);
    mocks.createRepoMock.mockResolvedValue({
      private: false,
      default_branch: "main",
    });
    mocks.updateRepoMock.mockResolvedValue({
      data: {
        private: false,
        default_branch: "main",
      },
    });
  });

  it("fails without binding when a newly created repo cannot be made private", async () => {
    await expect(
      connectChatToRepo("chat-1", "user-1", undefined, "repo-1"),
    ).rejects.toThrow("could not be confirmed private");

    expect(mocks.setChatRepoBindingMock).not.toHaveBeenCalled();
  });
});
