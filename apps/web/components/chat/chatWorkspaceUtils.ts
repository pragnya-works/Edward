import { MessageBlockType, parseMessageContent } from "@/lib/parsing/messageParser";

const MIN_SANDBOX_SIZE = 24;
const MAX_SANDBOX_SIZE = 75;

export function clampSandboxSize(size: number): number {
  return Math.min(MAX_SANDBOX_SIZE, Math.max(MIN_SANDBOX_SIZE, size));
}

export function easeSandboxToggle(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function extractLatestSandboxProjectName(
  content: string,
): string | null {
  const blocks = parseMessageContent(content);
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.type === MessageBlockType.SANDBOX && block.project) {
      return block.project;
    }
  }
  return null;
}
