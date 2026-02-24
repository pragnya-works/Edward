import { describe, expect, it } from "vitest";
import { MessageRole } from "@edward/auth";
import { resolveRetryTargetsFromMessages } from "../../../services/runs/retryMessageTargets.service.js";

describe("resolveRetryTargetsFromMessages", () => {
  it("resolves both targets when roles match", () => {
    const resolved = resolveRetryTargetsFromMessages(
      {
        retryTargetUserMessageId: "user-msg-1",
        retryTargetAssistantMessageId: "assistant-msg-1",
      },
      [
        { id: "user-msg-1", role: MessageRole.User },
        { id: "assistant-msg-1", role: MessageRole.Assistant },
      ],
    );

    expect(resolved).toEqual({
      userMessageId: "user-msg-1",
      assistantMessageId: "assistant-msg-1",
    });
  });

  it("drops targets that point to wrong roles", () => {
    const resolved = resolveRetryTargetsFromMessages(
      {
        retryTargetUserMessageId: "assistant-msg-1",
        retryTargetAssistantMessageId: "user-msg-1",
      },
      [
        { id: "user-msg-1", role: MessageRole.User },
        { id: "assistant-msg-1", role: MessageRole.Assistant },
      ],
    );

    expect(resolved).toEqual({});
  });

  it("returns empty object when requested IDs are not found", () => {
    const resolved = resolveRetryTargetsFromMessages(
      {
        retryTargetUserMessageId: "missing-user",
        retryTargetAssistantMessageId: "missing-assistant",
      },
      [{ id: "different-id", role: MessageRole.User }],
    );

    expect(resolved).toEqual({});
  });
});
