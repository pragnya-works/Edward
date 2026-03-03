import { describe, expect, it } from "vitest";
import {
  ConnectRepoRequestSchema,
  CreateBranchRequestSchema,
  GithubStatusRequestSchema,
  SyncRepoRequestSchema,
} from "../../schemas/github.schema.js";

describe("github schema contract", () => {
  it("accepts connect payload with owner/repo", () => {
    const result = ConnectRepoRequestSchema.safeParse({
      body: {
        chatId: "chat-1",
        repoFullName: "acme/landing-page",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts connect payload with repoName only", () => {
    const result = ConnectRepoRequestSchema.safeParse({
      body: {
        chatId: "chat-1",
        repoName: "landing-page",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects connect payload when no repo identifier is provided", () => {
    const result = ConnectRepoRequestSchema.safeParse({
      body: {
        chatId: "chat-1",
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid branch creation payload", () => {
    const createBranchValid = CreateBranchRequestSchema.safeParse({
      body: {
        chatId: "chat-1",
        branchName: "feature/new-ui",
      },
    });
    expect(createBranchValid.success).toBe(true);
  });

  it("rejects invalid branch creation payload", () => {
    const createBranchInvalid = CreateBranchRequestSchema.safeParse({
      body: {
        chatId: "chat-1",
        branchName: "refs/heads/main",
      },
    });
    expect(createBranchInvalid.success).toBe(false);
  });

  it("accepts valid sync payload", () => {
    const syncValid = SyncRepoRequestSchema.safeParse({
      body: {
        chatId: "chat-1",
        branch: "feature/new-ui",
        commitMessage: "feat: scaffold page",
      },
    });
    expect(syncValid.success).toBe(true);
  });

  it("rejects invalid sync payload", () => {
    const syncInvalid = SyncRepoRequestSchema.safeParse({
      body: {
        chatId: "chat-1",
        branch: "feature/new-ui",
        commitMessage: "",
      },
    });
    expect(syncInvalid.success).toBe(false);
  });

  it("validates github status query", () => {
    expect(
      GithubStatusRequestSchema.safeParse({
        query: { chatId: "chat-1" },
      }).success,
    ).toBe(true);

    expect(
      GithubStatusRequestSchema.safeParse({
        query: { chatId: "" },
      }).success,
    ).toBe(false);
  });
});
