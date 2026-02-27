import type { MessageContent } from "@edward/shared/llm/types";

const TRUNCATE_SUFFIX = "\n...[truncated]";

export function truncateUtf8(input: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const buf = Buffer.from(input, "utf8");
  if (buf.byteLength <= maxBytes) return input;
  if (maxBytes < TRUNCATE_SUFFIX.length) {
    return buf.subarray(0, maxBytes).toString("utf8");
  }
  const limit = maxBytes - TRUNCATE_SUFFIX.length;
  return buf.subarray(0, limit).toString("utf8") + TRUNCATE_SUFFIX;
}

export function stripAssistantArtifacts(content: string): string {
  let out = String(content ?? "");
  out = out.replace(/<Thinking>[\s\S]*?<\/Thinking>/g, "");
  out = out.replace(/<edward_install>[\s\S]*?<\/edward_install>/g, "");
  out = out.replace(/<edward_sandbox[\s\S]*?<\/edward_sandbox>/g, "");
  out = out.replace(/<edward_url_scrape[^>]*\/>/g, "");
  out = out.replace(/<\/?Response>/g, "");
  out = out.replace(/<\/?Thinking>/g, "");
  return out.trim();
}

export function toTimestampMs(value: unknown): number | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date.getTime();
    }
  }

  return null;
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getTextBytes(content: MessageContent): number {
  if (typeof content === "string") {
    return Buffer.byteLength(content, "utf8");
  }

  return content.reduce((total, part) => {
    if (part.type !== "text") {
      return total;
    }
    return total + Buffer.byteLength(part.text, "utf8");
  }, 0);
}
