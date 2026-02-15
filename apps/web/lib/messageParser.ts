export type MessageBlock =
  | { type: "thinking"; content: string }
  | { type: "file"; path: string; content: string }
  | { type: "command"; command: string; args: string[] }
  | { type: "install"; dependencies: string[] }
  | { type: "text"; content: string };

export function parseMessageContent(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    const thinkingStart = remaining.indexOf("<Thinking>");
    const fileStart = remaining.indexOf("<file");
    const installStart = remaining.indexOf("<edward_install>");
    const commandStart = remaining.indexOf("<edward_command");

    const candidates = [
      { type: "thinking", idx: thinkingStart },
      { type: "file", idx: fileStart },
      { type: "install", idx: installStart },
      { type: "command", idx: commandStart },
    ].filter((i) => i.idx !== -1);

    if (candidates.length === 0) {
      blocks.push({ type: "text", content: remaining });
      break;
    }

    candidates.sort((a, b) => a.idx - b.idx);
    const earliest = candidates[0];
    if (!earliest) break;

    if (earliest.idx > 0) {
      blocks.push({ type: "text", content: remaining.slice(0, earliest.idx) });
    }

    remaining = remaining.slice(earliest.idx);

    if (earliest.type === "thinking") {
      const endIdx = remaining.indexOf("</Thinking>");
      if (endIdx !== -1) {
        const thinkingContent = remaining
          .slice("<Thinking>".length, endIdx)
          .trim();
        blocks.push({ type: "thinking", content: thinkingContent });
        remaining = remaining.slice(endIdx + "</Thinking>".length);
      } else {
        blocks.push({ type: "text", content: remaining });
        break;
      }
    } else if (earliest.type === "file") {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);
        const pathMatch = tag.match(/path="([^"]*)"/);
        const filePath = pathMatch ? (pathMatch[1] ?? "unknown") : "unknown";

        const endTagIdx = remaining.indexOf("</file>");
        if (endTagIdx !== -1) {
          const fileContent = remaining
            .slice(closeTagIdx + 1, endTagIdx)
            .trim();
          blocks.push({ type: "file", path: filePath, content: fileContent });
          remaining = remaining.slice(endTagIdx + "</file>".length);
        } else {
          blocks.push({ type: "text", content: remaining });
          break;
        }
      } else {
        blocks.push({ type: "text", content: remaining });
        break;
      }
    } else if (earliest.type === "install") {
      const endIdx = remaining.indexOf("</edward_install>");
      if (endIdx !== -1) {
        const installContent = remaining
          .slice("<edward_install>".length, endIdx)
          .trim();
        const dependencies = installContent
          .split("\n")
          .map((l) => l.trim())
          .filter(
            (l) =>
              l && !l.startsWith("framework:") && !l.startsWith("packages:"),
          )
          .map((l) => l.replace(/^\s*[-*]\s*/, "").trim());

        blocks.push({ type: "install", dependencies });
        remaining = remaining.slice(endIdx + "</edward_install>".length);
      } else {
        blocks.push({ type: "text", content: remaining });
        break;
      }
    } else if (earliest.type === "command") {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);
        const commandMatch = tag.match(/command="([^"]*)"/);
        const command = commandMatch ? (commandMatch[1] ?? "") : "";

        let args: string[] = [];
        const argsMatch = tag.match(/args='([^']*)'/);
        if (argsMatch && argsMatch[1]) {
          try {
            args = JSON.parse(argsMatch[1]);
          } catch {
            args = [];
          }
        }

        blocks.push({ type: "command", command, args });
        remaining = remaining.slice(closeTagIdx + 1);
      } else {
        blocks.push({ type: "text", content: remaining });
        break;
      }
    }
  }

  return blocks.filter((b) => b.type !== "text" || b.content.trim().length > 0);
}
