import {
  db,
  message,
  eq,
  desc,
  getLatestBuildByChatId,
} from "@edward/auth";
import type { BuildErrorReport } from "../../services/diagnostics/types.js";
import { formatErrorForLLM } from "../../services/diagnostics/analyzer.js";
import { getActiveSandbox } from "../../services/sandbox/lifecycle/provisioning.js";
import {
  readAllProjectFiles,
  readSpecificFiles,
  formatProjectSnapshot,
} from "../../services/sandbox/read.sandbox.js";
import { logger } from "../../utils/logger.js";
import {
  type LlmConversationRole,
  isAssistantConversationRole,
  normalizeConversationRole,
} from "./messageRole.js";

const MAX_CONTEXT_BYTES = 150 * 1024;
const MAX_HISTORY_BYTES = 35 * 1024;
const MAX_MESSAGE_BYTES = 8 * 1024;
const HISTORY_LIMIT = 8;

export type LlmChatMessage = {
  role: LlmConversationRole;
  content: string;
};

function truncateUtf8(input: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const buf = Buffer.from(input, "utf8");
  if (buf.byteLength <= maxBytes) return input;
  return buf.subarray(0, maxBytes).toString("utf8") + "\n...[truncated]";
}

function stripAssistantArtifacts(content: string): string {
  let out = String(content ?? "");
  out = out.replace(/<Thinking>[\s\S]*?<\/Thinking>/g, "");
  out = out.replace(/<edward_install>[\s\S]*?<\/edward_install>/g, "");
  out = out.replace(/<edward_sandbox[\s\S]*?<\/edward_sandbox>/g, "");
  out = out.replace(/<\/?Response>/g, "");
  out = out.replace(/<\/?Thinking>/g, "");
  return out.trim();
}

export async function buildConversationMessages(chatId: string): Promise<{
  history: LlmChatMessage[];
  projectContext: string;
}> {
  const historyRows = await db.query.message.findMany({
    where: eq(message.chatId, chatId),
    orderBy: [desc(message.createdAt)],
    limit: HISTORY_LIMIT,
  });
  historyRows.reverse();

  const history: LlmChatMessage[] = [];
  let historyBytes = 0;

  for (const msg of historyRows) {
    const role = normalizeConversationRole((msg as { role?: unknown }).role);
    if (!role) continue;

    const rawContent = String((msg as { content?: unknown }).content ?? "");
    const cleaned = isAssistantConversationRole(role)
      ? stripAssistantArtifacts(rawContent)
      : rawContent.trim();
    if (!cleaned) continue;

    const safeContent = truncateUtf8(cleaned, MAX_MESSAGE_BYTES);
    const entry: LlmChatMessage = { role, content: safeContent };

    const entryBytes = Buffer.byteLength(entry.content, "utf8") + 16;
    if (historyBytes + entryBytes > MAX_HISTORY_BYTES) break;
    history.push(entry);
    historyBytes += entryBytes;
  }

  const latestBuild = await getLatestBuildByChatId(chatId);
  let projectContext = "";

  const errorReport: BuildErrorReport | null = (() => {
    if (latestBuild?.status !== "failed") return null;
    const raw = (latestBuild as { errorReport?: unknown }).errorReport as
      | Record<string, unknown>
      | undefined;
    if (!raw) return null;
    if (
      raw.failed === true &&
      Array.isArray(raw.errors) &&
      typeof raw.headline === "string"
    ) {
      return raw as unknown as BuildErrorReport;
    }
    return null;
  })();

  if (latestBuild && latestBuild.status === "failed") {
    if (errorReport && errorReport.errors.length > 0) {
      projectContext += formatErrorForLLM(errorReport) + "\n";
    } else {
      const rawError =
        (latestBuild as { errorReport?: Record<string, unknown> }).errorReport
          ?.rawOutput || "Build failed";
      projectContext += `BUILD FAILED:\n${rawError}\n`;
    }
  }

  const sandboxId = await getActiveSandbox(chatId);
  if (sandboxId) {
    try {
      let projectFiles: Map<string, string>;

      const affectedFiles = errorReport
        ? [...new Set(
            errorReport.errors
              .flatMap((e: typeof errorReport.errors[number]) => [
                e.error.file,
                ...(e.relatedFiles?.map(
                  (rf: typeof e.relatedFiles[number]) => rf.path,
                ) || []),
              ])
              .filter(
                (f: string): f is string => typeof f === "string" && f !== "unknown",
              ),
          )]
        : [];

      if (affectedFiles.length > 0) {
        logger.debug(
          { chatId, fileCount: affectedFiles.length },
          "Using targeted file context from error report",
        );
        projectFiles = await readSpecificFiles(sandboxId, affectedFiles);
      } else {
        projectFiles = await readAllProjectFiles(sandboxId);
      }

      const snapshot = formatProjectSnapshot(projectFiles);
      if (snapshot) {
        const currentBytes = Buffer.byteLength(projectContext, "utf8");
        const snapshotBytes = Buffer.byteLength(snapshot, "utf8");
        if (currentBytes + snapshotBytes <= MAX_CONTEXT_BYTES) {
          projectContext += (projectContext ? "\n\n" : "") + snapshot;
        } else {
          const remaining = Math.max(0, MAX_CONTEXT_BYTES - currentBytes);
          if (remaining > 256) {
            projectContext += (projectContext ? "\n\n" : "") + truncateUtf8(snapshot, remaining);
          }
        }
      }
    } catch (err) {
      logger.warn(
        { sandboxId, err },
        "Failed to pre-load project files into context",
      );
    }
  }

  if (projectContext) {
    projectContext = "PROJECT CONTEXT:\n" + projectContext;
  }

  return { history, projectContext };
}

export async function buildConversationContext(chatId: string) {
  const { history, projectContext } = await buildConversationMessages(chatId);
  const lines: string[] = ["CONVERSATION CONTEXT:"];
  for (const msg of history) {
    lines.push(`${msg.role.toUpperCase()}: ${msg.content}`);
  }
  if (projectContext) lines.push("", projectContext);
  return lines.join("\n") + "\n";
}
