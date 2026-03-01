import { describe, expect, it } from "vitest";
import {
  createTurnBudgetState,
  updateToolBudgetState,
} from "../../../controllers/chat/session/loop/budgets.js";
import {
  MAX_AGENT_TOOL_CALLS_PER_RUN,
  MAX_AGENT_TOOL_CALLS_PER_TURN,
  MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS,
} from "../../../utils/constants.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";

describe("agent loop tool budgets", () => {
  it("allows using tool budget up to the configured per-turn limit", () => {
    const state = createTurnBudgetState();
    const toolResults: AgentToolResult[] = Array.from(
      { length: MAX_AGENT_TOOL_CALLS_PER_TURN },
      () => ({
        tool: "command",
        command: "pwd",
        args: [],
        stdout: "/workspace",
        stderr: "",
      }),
    );

    updateToolBudgetState(state, toolResults, toolResults.length);

    expect(state.toolBudgetExceededThisTurn).toBe(false);
  });

  it("allows using run budget up to the configured run limit", () => {
    const state = createTurnBudgetState();
    updateToolBudgetState(state, [], MAX_AGENT_TOOL_CALLS_PER_RUN);
    expect(state.toolRunBudgetExceededThisTurn).toBe(false);
  });

  it("marks per-turn budget exceeded only after crossing the limit", () => {
    const state = createTurnBudgetState();
    const toolResults: AgentToolResult[] = Array.from(
      { length: MAX_AGENT_TOOL_CALLS_PER_TURN + 1 },
      () => ({
        tool: "command",
        command: "pwd",
        args: [],
        stdout: "/workspace",
        stderr: "",
      }),
    );

    updateToolBudgetState(state, toolResults, toolResults.length);
    expect(state.toolBudgetExceededThisTurn).toBe(true);
  });

  it("marks run budget exceeded only after crossing the run limit", () => {
    const state = createTurnBudgetState();
    updateToolBudgetState(state, [], MAX_AGENT_TOOL_CALLS_PER_RUN + 1);
    expect(state.toolRunBudgetExceededThisTurn).toBe(true);
  });

  it("allows tool payload up to the configured payload limit", () => {
    const state = createTurnBudgetState();
    const payloadSafeStdout = "x".repeat(
      Math.floor(MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS * 0.8),
    );
    const toolResults: AgentToolResult[] = [
      {
        tool: "command",
        command: "cat",
        args: ["README.md"],
        stdout: payloadSafeStdout,
        stderr: "",
      },
    ];

    updateToolBudgetState(state, toolResults, toolResults.length);
    expect(state.toolPayloadExceededThisTurn).toBe(false);
  });

  it("marks tool payload exceeded when payload crosses the limit", () => {
    const state = createTurnBudgetState();
    const payloadOverflowStdout = "x".repeat(MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS + 512);
    const toolResults: AgentToolResult[] = [
      {
        tool: "command",
        command: "cat",
        args: ["README.md"],
        stdout: payloadOverflowStdout,
        stderr: "",
      },
    ];

    updateToolBudgetState(state, toolResults, toolResults.length);
    expect(state.toolPayloadExceededThisTurn).toBe(true);
  });
});
