import { runAgentLoop as runAgentLoopRunner } from "./internal/agentLoop.runner.js";

export function runAgentLoop(
  params: Parameters<typeof runAgentLoopRunner>[0],
): ReturnType<typeof runAgentLoopRunner> {
  return runAgentLoopRunner(params);
}
