import { describe, expect, it } from "vitest";
import {
  AgentLoopStopReason,
  MetaPhase,
  ParserEventType,
  StreamTerminationReason,
  STREAM_EVENT_VERSION,
  type StreamEvent,
} from "@edward/shared/stream-events";
import { ParserEventSchema } from "../../schemas/chat.schema.js";

describe("stream event contract", () => {
  it("validates shared stream events in API schema", () => {
    const events: StreamEvent[] = [
      {
        type: ParserEventType.META,
        version: STREAM_EVENT_VERSION,
        chatId: "chat-1",
        userMessageId: "user-msg-1",
        assistantMessageId: "assistant-msg-1",
        isNewChat: true,
        runId: "run-1",
        phase: MetaPhase.SESSION_START,
      },
      {
        type: ParserEventType.TEXT,
        version: STREAM_EVENT_VERSION,
        content: "hello",
      },
      {
        type: ParserEventType.COMMAND,
        version: STREAM_EVENT_VERSION,
        command: "ls",
        args: ["-la"],
        exitCode: 0,
      },
      {
        type: ParserEventType.WEB_SEARCH,
        version: STREAM_EVENT_VERSION,
        query: "react docs",
        maxResults: 3,
      },
      {
        type: ParserEventType.METRICS,
        version: STREAM_EVENT_VERSION,
        completionTime: 123,
        inputTokens: 456,
        outputTokens: 789,
      },
      {
        type: ParserEventType.BUILD_STATUS,
        version: STREAM_EVENT_VERSION,
        chatId: "chat-1",
        status: "success",
        buildId: "build-1",
        previewUrl: "https://preview.example.com",
      },
      {
        type: ParserEventType.META,
        version: STREAM_EVENT_VERSION,
        chatId: "chat-1",
        userMessageId: "user-msg-1",
        assistantMessageId: "assistant-msg-1",
        isNewChat: true,
        runId: "run-1",
        phase: MetaPhase.SESSION_COMPLETE,
        loopStopReason: AgentLoopStopReason.DONE,
        terminationReason: StreamTerminationReason.COMPLETED,
      },
    ];

    for (const event of events) {
      const parsed = ParserEventSchema.safeParse(event);
      expect(parsed.success).toBe(true);
    }
  });
});
