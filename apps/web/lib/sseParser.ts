import type { SSEEvent } from "./chatTypes";

export interface ParsedSSEEvent {
  id?: string;
  event: SSEEvent;
}

export function parseSSELines(buffer: string): {
  events: ParsedSSEEvent[];
  remaining: string;
} {
  const events: ParsedSSEEvent[] = [];
  const normalized = buffer.replaceAll("\r\n", "\n");
  const chunks = normalized.split("\n\n");
  const trailingChunk = chunks.pop();

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const eventId = lines
      .find((line) => line.startsWith("id:"))
      ?.slice(3)
      .trim();

    const payload = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");

    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      const parsed = JSON.parse(payload) as SSEEvent;
      events.push({
        id: eventId,
        event: parsed,
      });
    } catch {
      // Skip malformed completed SSE chunks so one bad frame doesn't block the stream.
      continue;
    }
  }

  return { events, remaining: trailingChunk ?? "" };
}
