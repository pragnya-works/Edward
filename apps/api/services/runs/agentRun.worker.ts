import { processAgentRunJob as processAgentRunJobImpl } from "./agentRun.worker/processor.js";

interface Publisher {
  publish(channel: string, payload: string): Promise<unknown>;
}

export async function processAgentRunJob(
  runId: string,
  publisher: Publisher,
): Promise<void> {
  return processAgentRunJobImpl(runId, publisher);
}
