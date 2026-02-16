import type { SSEEvent } from "./chatTypes";

export function parseSSELines(buffer: string): {
  events: SSEEvent[];
  remaining: string;
} {
  const events: SSEEvent[] = [];
  const normalized = buffer.replaceAll("\r\n", "\n");
  const chunks = normalized.split("\n\n");
  const trailingChunk = chunks.pop();

  for (const chunk of chunks) {
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
      events.push(parsed);
    } catch {
      return {
        events,
        remaining: `${chunk}\n\n${trailingChunk ?? ""}`,
      };
    }
  }

  return { events, remaining: trailingChunk ?? "" };
}
