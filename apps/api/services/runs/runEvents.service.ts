import { appendRunEvent } from "@edward/auth";
import type { StreamEvent } from "@edward/shared/stream-events";

const RUN_EVENT_CHANNEL_PREFIX = "edward:run-events:";

export interface RunEventEnvelope {
  id: string;
  runId: string;
  seq: number;
  eventType: string;
  event: StreamEvent;
}

interface Publisher {
  publish(channel: string, payload: string): Promise<unknown>;
}

export function getRunEventChannel(runId: string): string {
  return `${RUN_EVENT_CHANNEL_PREFIX}${runId}`;
}

export async function persistRunEvent(
  runId: string,
  event: StreamEvent,
  publisher?: Publisher,
): Promise<RunEventEnvelope> {
  const row = await appendRunEvent({
    runId,
    eventType: event.type,
    event: event as unknown as Record<string, unknown>,
  });

  const envelope: RunEventEnvelope = {
    id: row.id,
    runId,
    seq: row.seq,
    eventType: row.eventType,
    event: row.event as unknown as StreamEvent,
  };

  if (publisher) {
    await publisher.publish(getRunEventChannel(runId), JSON.stringify(envelope));
  }

  return envelope;
}
