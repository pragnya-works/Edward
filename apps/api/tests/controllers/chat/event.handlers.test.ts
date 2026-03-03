import { describe, expect, it } from "vitest";
import { ParserEventType } from "@edward/shared/streamEvents";
import type { WorkflowState } from "../../../services/planning/schemas.js";
import {
  handleParserEvent,
  type EventHandlerContext,
} from "../../../services/chat/session/events/handler.js";

function createContext(): EventHandlerContext {
  return {
    workflow: {
      id: "wf-1",
      userId: "user-1",
      chatId: "chat-1",
      context: { errors: [] },
      history: [],
      status: "pending",
      currentStep: "analyze",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as WorkflowState,
    res: { writable: true, writableEnded: false } as never,
    chatId: "chat-1",
    isFollowUp: false,
    sandboxTagDetected: false,
    currentFilePath: undefined,
    isFirstFileChunk: true,
    generatedFiles: new Map<string, string>(),
    declaredPackages: [],
    toolResultsThisTurn: [],
  };
}

describe("event handler smoke cases", () => {
  it("ignores FILE_CONTENT when no file session is active", async () => {
    const ctx = createContext();
    const result = await handleParserEvent(ctx, {
      type: ParserEventType.FILE_CONTENT,
      content: "hello",
    });

    expect(result.handled).toBe(false);
    expect(result.currentFilePath).toBeUndefined();
    expect(result.isFirstFileChunk).toBe(true);
    expect(result.sandboxTagDetected).toBe(false);
  });

  it("handles SANDBOX_END safely when no sandbox exists", async () => {
    const ctx = createContext();
    const result = await handleParserEvent(ctx, {
      type: ParserEventType.SANDBOX_END,
    });

    expect(result.handled).toBe(false);
    expect(result.currentFilePath).toBeUndefined();
    expect(result.sandboxTagDetected).toBe(false);
  });
});
