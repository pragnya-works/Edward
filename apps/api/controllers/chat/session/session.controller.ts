import { runStreamSession as runStreamSessionOrchestrator } from "./orchestrator/runStreamSession.orchestrator.js";

export function runStreamSession(
  params: Parameters<typeof runStreamSessionOrchestrator>[0],
): ReturnType<typeof runStreamSessionOrchestrator> {
  return runStreamSessionOrchestrator(params);
}
