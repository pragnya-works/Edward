import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpStatus } from "../../utils/constants.js";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(() => "user-1"),
  connectChatToRepo: vi.fn(),
  createChatBranch: vi.fn(),
  syncChatToGithub: vi.fn(),
  getChatGithubStatus: vi.fn(),
  sendSuccess: vi.fn(),
  sendError: vi.fn(),
}));

vi.mock("../../middleware/auth.js", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));

vi.mock("../../services/github/sync.service.js", () => ({
  connectChatToRepo: mocks.connectChatToRepo,
  createChatBranch: mocks.createChatBranch,
  syncChatToGithub: mocks.syncChatToGithub,
}));

vi.mock("../../services/github/status.service.js", () => ({
  getChatGithubStatus: mocks.getChatGithubStatus,
}));

vi.mock("../../utils/response.js", () => ({
  sendSuccess: mocks.sendSuccess,
  sendError: mocks.sendError,
}));

describe("github use case", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectChatToRepo.mockResolvedValue({ repoFullName: "org/repo" });
    mocks.createChatBranch.mockResolvedValue({ existed: false });
    mocks.syncChatToGithub.mockResolvedValue({ commitSha: "abc" });
    mocks.getChatGithubStatus.mockResolvedValue({ connected: true });
  });

  it("connects repository and returns success payload", async () => {
    const { connectRepo } = await import("../../services/github/github.useCase.js");

    await connectRepo(
      {
        body: { chatId: "chat-1", repoFullName: "org/repo", repoName: "repo" },
      } as never,
      {} as never,
      vi.fn(),
    );

    expect(mocks.connectChatToRepo).toHaveBeenCalledWith(
      "chat-1",
      "user-1",
      "org/repo",
      "repo",
    );
    expect(mocks.sendSuccess).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.OK,
      "Repository 'org/repo' connected successfully",
      expect.any(Object),
    );
  });

  it("maps branch conflict errors", async () => {
    const { createBranch } = await import("../../services/github/github.useCase.js");

    mocks.createChatBranch.mockRejectedValueOnce(new Error("already connected"));

    await createBranch(
      {
        body: { chatId: "chat-1", branchName: "feat", baseBranch: "main" },
      } as never,
      {} as never,
      vi.fn(),
    );

    expect(mocks.sendError).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.CONFLICT,
      "already connected",
    );
  });

  it("maps unauthorized sync errors", async () => {
    const { syncRepo } = await import("../../services/github/github.useCase.js");

    mocks.syncChatToGithub.mockRejectedValueOnce(new Error("bad credentials"));

    await syncRepo(
      {
        body: { chatId: "chat-1", branch: "main", commitMessage: "msg" },
      } as never,
      {} as never,
      vi.fn(),
    );

    expect(mocks.sendError).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.UNAUTHORIZED,
      "bad credentials",
    );
  });

  it("maps fallback errors to internal server error", async () => {
    const { githubStatus } = await import("../../services/github/github.useCase.js");

    mocks.getChatGithubStatus.mockRejectedValueOnce(new Error("unexpected failure"));

    await githubStatus(
      {
        query: { chatId: "chat-1" },
      } as never,
      {} as never,
      vi.fn(),
    );

    expect(mocks.sendError).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.INTERNAL_SERVER_ERROR,
      "unexpected failure",
    );
  });
});
