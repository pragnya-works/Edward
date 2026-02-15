import type { SSEEvent } from "./chatTypes";

export function parseSSELines(buffer: string): {
  events: SSEEvent[];
  remaining: string;
} {
  const events: SSEEvent[] = [];
  const lines = buffer.split("\n");
  let remaining = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;

    if (line.startsWith("data: ")) {
      const payload = line.slice(6);
      if (payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload) as SSEEvent;
        events.push(parsed);
      } catch {
        remaining = lines.slice(i).join("\n");
        break;
      }
    }
  }

  return { events, remaining };
}
