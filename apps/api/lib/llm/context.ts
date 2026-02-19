import {
  db,
  message,
  attachment,
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
import { type MessageContentPart, type MessageContent } from "./types.js";
import {
  validateBase64Image,
  validateImageUrl,
} from "../../utils/imageValidation.js";

const MAX_CONTEXT_BYTES = 150 * 1024;
const MAX_HISTORY_BYTES = 35 * 1024;
const MAX_MESSAGE_BYTES = 8 * 1024;
const HISTORY_LIMIT = 8;

export type LlmChatMessage = {
  role: LlmConversationRole;
  content: MessageContent;
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
  out = out.replace(/<edward_url_scrape[^>]*\/>/g, "");
  out = out.replace(/<\/?Response>/g, "");
  out = out.replace(/<\/?Thinking>/g, "");
  return out.trim();
}

interface BuildConversationMessagesOptions {
  excludeMessageIds?: string[];
}

export async function buildConversationMessages(
  chatId: string,
  options?: BuildConversationMessagesOptions,
): Promise<{
  history: LlmChatMessage[];
  projectContext: string;
}> {
  const excludedMessageIds = new Set(
    (options?.excludeMessageIds ?? []).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    ),
  );

  const historyRows = await db.query.message.findMany({
    where: eq(message.chatId, chatId),
    orderBy: [desc(message.createdAt)],
    limit: HISTORY_LIMIT + excludedMessageIds.size,
  });
  historyRows.reverse();

  const history: LlmChatMessage[] = [];
  let historyBytes = 0;

  for (const msg of historyRows) {
    const msgId = (msg as { id?: string }).id;
    if (msgId && excludedMessageIds.has(msgId)) {
      continue;
    }

    const role = normalizeConversationRole((msg as { role?: unknown }).role);
    if (!role) continue;

    const rawContent = String((msg as { content?: unknown }).content ?? "");

    if (isAssistantConversationRole(role)) {
      const cleaned = stripAssistantArtifacts(rawContent);
      if (!cleaned) continue;
      const safeContent = truncateUtf8(cleaned, MAX_MESSAGE_BYTES);
      const entry: LlmChatMessage = { role, content: safeContent };
      const entryBytes = Buffer.byteLength(safeContent, "utf8") + 16;
      if (historyBytes + entryBytes > MAX_HISTORY_BYTES) break;
      history.push(entry);
      historyBytes += entryBytes;
    } else {
      let messageContent: MessageContent = rawContent.trim();
      let contentBytes = Buffer.byteLength(rawContent, "utf8");

      if (msgId) {
        try {
          const msgAttachments = await db
            .select()
            .from(attachment)
            .where(eq(attachment.messageId, msgId));

          const imageAttachments = msgAttachments.filter(
            (a) => a.type === "image",
          );

          if (imageAttachments.length > 0) {
            const parts: MessageContentPart[] = [];

            if (rawContent.trim()) {
              parts.push({ type: "text", text: rawContent.trim() });
            }

            for (const att of imageAttachments) {
              if (att.url.startsWith("data:")) {
                const match = att.url.match(/^data:([^;]+);base64,(.+)$/);
                if (!match || !match[1] || !match[2]) continue;
                const dataUrlImage = validateBase64Image(match[2], match[1]);
                if (!dataUrlImage.success) continue;
                parts.push({
                  type: "image",
                  base64: dataUrlImage.data.base64,
                  mimeType: dataUrlImage.data.mimeType,
                });
                contentBytes += dataUrlImage.data.sizeBytes;
                continue;
              }

              const remoteImage = await validateImageUrl(att.url);
              if (remoteImage.success) {
                parts.push({
                  type: "image",
                  base64: remoteImage.data.base64,
                  mimeType: remoteImage.data.mimeType,
                });
                contentBytes += remoteImage.data.sizeBytes;
              }
            }

            messageContent = parts;
          }
        } catch (err) {
          logger.warn(
            { err, msgId },
            "Failed to fetch attachments for message",
          );
        }
      }

      if (!rawContent.trim() && typeof messageContent === "string") continue;

      const entry: LlmChatMessage = { role, content: messageContent };
      if (historyBytes + contentBytes > MAX_HISTORY_BYTES) break;
      history.push(entry);
      historyBytes += contentBytes;
    }
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
        ? [
            ...new Set(
              errorReport.errors
                .flatMap((e: (typeof errorReport.errors)[number]) => [
                  e.error.file,
                  ...(e.relatedFiles?.map(
                    (rf: (typeof e.relatedFiles)[number]) => rf.path,
                  ) || []),
                ])
                .filter(
                  (f: string): f is string =>
                    typeof f === "string" && f !== "unknown",
                ),
            ),
          ]
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
            projectContext +=
              (projectContext ? "\n\n" : "") +
              truncateUtf8(snapshot, remaining);
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
