import {
  db,
  message,
  attachment,
  eq,
  inArray,
  desc,
  getLatestBuildByChatId,
} from "@edward/auth";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import type { BuildErrorReport } from "../../services/diagnostics/types.js";
import { formatErrorForLLM } from "../../services/diagnostics/analyzer.js";
import { getActiveSandbox } from "../../services/sandbox/lifecycle/provisioning.js";
import {
  readAllProjectFiles,
  readSpecificFiles,
  formatProjectSnapshot,
} from "../../services/sandbox/read.service.js";
import { logger } from "../../utils/logger.js";
import {
  type LlmConversationRole,
  isAssistantConversationRole,
  normalizeConversationRole,
} from "./messageRole.js";
import type { MessageContentPart, MessageContent } from "@edward/shared/llm/types";
import { buildAttachedImageUrlContextFromUrls } from "../../utils/imageContext.js";
import {
  getTextBytes,
  isHttpUrl,
  stripAssistantArtifacts,
  toTimestampMs,
  truncateUtf8,
} from "./context.helpers.js";

const MAX_CONTEXT_BYTES = 150 * 1024;
const MAX_HISTORY_BYTES = 35 * 1024;
const MAX_MESSAGE_BYTES = 8 * 1024;
const HISTORY_LIMIT = 8;
const HISTORY_LOOKBACK_LIMIT = 64;
const MAX_HISTORY_IMAGE_URLS_PER_MESSAGE = 4;

export type LlmChatMessage = {
  role: LlmConversationRole;
  content: MessageContent;
};

interface BuildConversationMessagesOptions {
  excludeMessageIds?: string[];
  maxCreatedAt?: Date;
}

type HistoryAttachment = {
  type: string;
  url: string;
};

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
  const maxCreatedAtMs = toTimestampMs(options?.maxCreatedAt);
  const historyQueryLimit =
    maxCreatedAtMs === null
      ? HISTORY_LIMIT + excludedMessageIds.size
      : Math.max(HISTORY_LIMIT + excludedMessageIds.size, HISTORY_LOOKBACK_LIMIT);

  const historyRows = await db.query.message.findMany({
    where: eq(message.chatId, chatId),
    orderBy: [desc(message.createdAt)],
    limit: historyQueryLimit,
  });

  const filteredHistoryRows = historyRows.filter((msg) => {
    const msgId = (msg as { id?: string }).id;
    if (msgId && excludedMessageIds.has(msgId)) {
      return false;
    }

    if (maxCreatedAtMs === null) {
      return true;
    }

    const createdAtMs = toTimestampMs((msg as { createdAt?: unknown }).createdAt);
    return createdAtMs !== null && createdAtMs <= maxCreatedAtMs;
  });

  const historyMessageIds = filteredHistoryRows
    .map((msg) => (msg as { id?: string }).id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const attachmentsByMessageId = new Map<string, HistoryAttachment[]>();
  if (historyMessageIds.length > 0) {
    try {
      const attachmentRows = await db
        .select()
        .from(attachment)
        .where(inArray(attachment.messageId, historyMessageIds));

      for (const row of attachmentRows) {
        const rowMessageId = (row as { messageId?: unknown }).messageId;
        const rowType = (row as { type?: unknown }).type;
        const rowUrl = (row as { url?: unknown }).url;

        if (
          typeof rowMessageId !== "string" ||
          typeof rowType !== "string" ||
          typeof rowUrl !== "string"
        ) {
          continue;
        }

        const existing = attachmentsByMessageId.get(rowMessageId) ?? [];
        existing.push({ type: rowType, url: rowUrl });
        attachmentsByMessageId.set(rowMessageId, existing);
      }
    } catch (err) {
      logger.warn(
        { chatId, err },
        "Failed to prefetch conversation attachments for context",
      );
    }
  }

  const historyNewestFirst: LlmChatMessage[] = [];
  let historyBytes = 0;

  for (const msg of filteredHistoryRows) {
    const msgId = (msg as { id?: string }).id;
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
      historyNewestFirst.push(entry);
      historyBytes += entryBytes;
    } else {
      let messageContent: MessageContent = rawContent.trim();
      let contentBytes = Buffer.byteLength(rawContent, "utf8");

      const msgAttachments = msgId
        ? (attachmentsByMessageId.get(msgId) ?? [])
        : [];
      const imageAttachments = msgAttachments.filter(
        (entry) => entry.type === "image",
      );

      if (imageAttachments.length > 0) {
        const parts: MessageContentPart[] = [];
        const imageSourceUrls: string[] = [];
        let inlineImageCount = 0;

        if (rawContent.trim()) {
          parts.push({ type: "text", text: rawContent.trim() });
        }

        for (const imageAttachment of imageAttachments) {
          const candidateUrl = imageAttachment.url.trim();
          if (!candidateUrl) {
            continue;
          }

          if (candidateUrl.startsWith("data:")) {
            inlineImageCount += 1;
            continue;
          }

          if (
            imageSourceUrls.length >= MAX_HISTORY_IMAGE_URLS_PER_MESSAGE ||
            !isHttpUrl(candidateUrl)
          ) {
            continue;
          }
          imageSourceUrls.push(candidateUrl);
        }

        const imageUrlContext = buildAttachedImageUrlContextFromUrls(
          imageSourceUrls,
        );
        if (imageUrlContext) {
          parts.push({
            type: "text",
            text: imageUrlContext,
          });
        }

        if (inlineImageCount > 0) {
          parts.push({
            type: "text",
            text: `Attached inline image${inlineImageCount === 1 ? "" : "s"}: ${inlineImageCount}`,
          });
        }

        if (parts.length > 0) {
          messageContent = parts;
          contentBytes = getTextBytes(parts);
        }
      }

      if (!rawContent.trim() && typeof messageContent === "string") continue;

      const entry: LlmChatMessage = { role, content: messageContent };
      const entryBytes = contentBytes + 16;
      if (historyBytes + entryBytes > MAX_HISTORY_BYTES) break;
      historyNewestFirst.push(entry);
      historyBytes += entryBytes;
    }
  }

  const history = historyNewestFirst.reverse();

  const latestBuild = await getLatestBuildByChatId(chatId);
  let projectContext = "";

  const errorReport: BuildErrorReport | null = (() => {
    if (latestBuild?.status !== BuildRecordStatus.FAILED) return null;
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

  if (latestBuild && latestBuild.status === BuildRecordStatus.FAILED) {
    if (errorReport) {
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
