import { describe, expect, it } from "vitest";
import {
  AGENT_RUN_METADATA_VERSION,
  createAgentRunMetadata,
  parseAgentRunMetadata,
} from "../../../services/runs/runMetadata.js";

const validWorkflow = {
  id: "wf-1",
  userId: "user-1",
  chatId: "chat-1",
  status: "pending",
  currentStep: "ANALYZE",
  context: { errors: [] },
  history: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe("runMetadata", () => {
  it("creates metadata with version tag", () => {
    const metadata = createAgentRunMetadata({
      workflow: validWorkflow as never,
      userContent: [{ type: "text", text: "hello" }] as never,
      userTextContent: "hello",
      preVerifiedDeps: ["zod"],
      isFollowUp: false,
      intent: "generate",
    });

    expect(metadata.version).toBe(AGENT_RUN_METADATA_VERSION);
    expect(metadata.intent).toBe("generate");
  });

  it("parses valid metadata and normalizes optional fields", () => {
    const parsed = parseAgentRunMetadata({
      version: AGENT_RUN_METADATA_VERSION,
      workflow: validWorkflow,
      userContent: [{ type: "text", text: "build app" }],
      userTextContent: "build app",
      preVerifiedDeps: ["react"],
      isFollowUp: true,
      intent: "fix",
      model: "gpt-5",
      traceId: "trace-1",
      resumeCheckpoint: {
        turn: 2,
        fullRawResponse: "raw",
        agentMessages: [{ role: "assistant", content: "ok" }],
        sandboxTagDetected: true,
        outputTokens: 88,
        updatedAt: 123,
      },
    });

    expect(parsed.version).toBe(AGENT_RUN_METADATA_VERSION);
    expect(parsed.model).toBe("gpt-5");
    expect(parsed.traceId).toBe("trace-1");
    expect(parsed.resumeCheckpoint?.totalToolCallsInRun).toBe(0);
    expect(parsed.resumeCheckpoint?.outputTokens).toBe(88);
  });

  it("rejects unsupported metadata version", () => {
    expect(() =>
      parseAgentRunMetadata({
        version: "legacy",
      }),
    ).toThrow("Unsupported run metadata version");
  });

  it("rejects invalid metadata shape", () => {
    expect(() =>
      parseAgentRunMetadata({
        version: AGENT_RUN_METADATA_VERSION,
        workflow: validWorkflow,
        userContent: [],
        userTextContent: "ok",
        preVerifiedDeps: ["react", 42],
        isFollowUp: false,
        intent: "generate",
      }),
    ).toThrow("Run metadata preVerifiedDeps is invalid");
  });
});
