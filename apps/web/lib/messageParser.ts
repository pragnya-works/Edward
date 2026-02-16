export type MessageBlock =
  | { type: "thinking"; content: string }
  | { type: "file"; path: string; content: string; isInternal?: boolean }
  | { type: "command"; command: string; args: string[] }
  | { type: "install"; dependencies: string[] }
  | { type: "sandbox"; project?: string; base?: string }
  | { type: "done" }
  | { type: "text"; content: string };

export function parseMessageContent(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let remaining = content;
  let inSandbox = false;
  let inResponse = false;

  // Check if content contains any <Response> tags to decide if we should be strict
  const hasResponseTags = content.includes("<Response>");

  while (remaining.length > 0) {
    const thinkingStart = remaining.indexOf("<Thinking>");
    const fileStart = remaining.indexOf("<file");
    const installStart = remaining.indexOf("<edward_install>");
    const commandStart = remaining.indexOf("<edward_command");
    const sandboxStart = remaining.indexOf("<edward_sandbox");
    const sandboxEnd = remaining.indexOf("</edward_sandbox>");
    const doneStart = remaining.indexOf("<edward_done");
    const responseStart = remaining.indexOf("<Response>");
    const responseEnd = remaining.indexOf("</Response>");

    const candidates = [
      { type: "thinking", idx: thinkingStart },
      { type: "file", idx: fileStart },
      { type: "install", idx: installStart },
      { type: "command", idx: commandStart },
      { type: "sandbox", idx: sandboxStart },
      { type: "sandbox_end", idx: sandboxEnd },
      { type: "done", idx: doneStart },
      { type: "response", idx: responseStart },
      { type: "response_end", idx: responseEnd },
    ].filter((i) => i.idx !== -1);

    if (candidates.length === 0) {
      // If we are in strictly tagged mode, only push if inResponse
      // Otherwise (legacy), push everything
      if (!hasResponseTags || inResponse) {
        blocks.push({ type: "text", content: remaining });
      }
      break;
    }

    candidates.sort((a, b) => a.idx - b.idx);
    const earliest = candidates[0];
    if (!earliest) break;

    if (earliest.idx > 0) {
      const text = remaining.slice(0, earliest.idx);
      if (!hasResponseTags || inResponse) {
        blocks.push({ type: "text", content: text });
      }
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
        // Look for implicit exit points while streaming or for malformed output
        const nextResponse = remaining.indexOf("<Response>");
        const nextFile = remaining.indexOf("<file");
        const nextInstall = remaining.indexOf("<edward_install");
        const nextSandbox = remaining.indexOf("<edward_sandbox");
        const nextCommand = remaining.indexOf("<edward_command");
        const nextDone = remaining.indexOf("<edward_done");

        const exitPoints = [
          nextResponse, nextFile, nextInstall,
          nextSandbox, nextCommand, nextDone
        ].filter(idx => idx !== -1);

        if (exitPoints.length > 0) {
          const earliestExit = Math.min(...exitPoints);
          const thinkingContent = remaining.slice("<Thinking>".length, earliestExit).trim();
          if (thinkingContent) {
            blocks.push({ type: "thinking", content: thinkingContent });
          }
          remaining = remaining.slice(earliestExit);
        } else {
          // Partial thinking tag while streaming
          const thinkingContent = remaining.slice("<Thinking>".length).trim();
          if (thinkingContent) {
            blocks.push({ type: "thinking", content: thinkingContent });
          }
          break;
        }
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
          blocks.push({
            type: "file",
            path: filePath,
            content: fileContent,
            isInternal: inSandbox,
          });
          remaining = remaining.slice(endTagIdx + "</file>".length);
        } else {
          // Partial file content while streaming
          const fileContent = remaining.slice(closeTagIdx + 1).trim();
          blocks.push({
            type: "file",
            path: filePath,
            content: fileContent,
            isInternal: inSandbox,
          });
          break;
        }
      } else {
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
        break;
      }
    } else if (earliest.type === "sandbox") {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);
        const projectMatch = tag.match(/project="([^"]*)"/);
        const baseMatch = tag.match(/base="([^"]*)"/);

        blocks.push({
          type: "sandbox",
          project: projectMatch?.[1],
          base: baseMatch?.[1],
        });
        inSandbox = true;
        remaining = remaining.slice(closeTagIdx + 1);
      } else {
        break;
      }
    } else if (earliest.type === "sandbox_end") {
      inSandbox = false;
      remaining = remaining.slice("</edward_sandbox>".length);
    } else if (earliest.type === "done") {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        blocks.push({ type: "done" });
        remaining = remaining.slice(closeTagIdx + 1);
      } else {
        break;
      }
    } else if (earliest.type === "response") {
      inResponse = true;
      remaining = remaining.slice("<Response>".length);
    } else if (earliest.type === "response_end") {
      inResponse = false;
      remaining = remaining.slice("</Response>".length);
    }
  }

  return blocks.filter((b) => b.type !== "text" || b.content.trim().length > 0);
}
