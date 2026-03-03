import { getActiveSandbox } from "../../sandbox/lifecycle/provisioning.js";
import { cleanupSandbox } from "../../sandbox/lifecycle/cleanup.js";
import { buildS3Key } from "../../storage/key.utils.js";
import { deleteFolder } from "../../storage.service.js";
import {
  deletePreviewSubdomain,
} from "../../previewRouting/registration.js";
import { generatePreviewSubdomain } from "../../previewRouting/subdomain.js";
import { logger } from "../../../utils/logger.js";
import {
  ERROR_MESSAGES,
  HttpStatus,
} from "../../../utils/constants.js";
import { QueryUseCaseError } from "./query.useCaseError.js";
import type { ChatRequestContext } from "./requestContext.js";
import {
  countChatsByUser,
  deleteChatRecord,
  getAttachmentsByMessageIds,
  getChatMetaFallbackRecord,
  getChatMetaRecord,
  getChatSubdomainRecord,
  getMessagesByChatId,
  getRecentChatsByUser,
} from "./history.repository.js";

interface ChatMessageAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
}

export interface ChatHistoryMessage {
  id: string;
  chatId: string;
  role: string;
  content: string | null;
  createdAt: Date;
  updatedAt: Date;
  attachments: ChatMessageAttachment[];
}

export interface ChatMetaSummary {
  title: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: Date;
}

export interface RecentChatsParams {
  userId: string;
  limit: number;
  offset: number;
}

export async function getChatHistoryUseCase(
  context: ChatRequestContext,
): Promise<ChatHistoryMessage[]> {
  const messages = await getMessagesByChatId(context.chatId);

  const messageIds = messages.map((entry) => entry.id);
  const attachmentsByMessage = new Map<string, ChatMessageAttachment[]>();

  if (messageIds.length > 0) {
    const attachments = await getAttachmentsByMessageIds(messageIds);

    for (const attachmentRecord of attachments) {
      const existing = attachmentsByMessage.get(attachmentRecord.messageId) ?? [];
      existing.push({
        id: attachmentRecord.id,
        name: attachmentRecord.name,
        url: attachmentRecord.url,
        type: attachmentRecord.type,
      });
      attachmentsByMessage.set(attachmentRecord.messageId, existing);
    }
  }

  return messages.map((entry) => ({
    id: entry.id,
    chatId: entry.chatId,
    role: entry.role,
    content: entry.content,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    attachments: attachmentsByMessage.get(entry.id) ?? [],
  }));
}

export async function deleteChatUseCase(
  context: ChatRequestContext,
): Promise<void> {
  const chatData = await getChatSubdomainRecord(context.chatId);

  const storagePrefix = buildS3Key(context.userId, context.chatId).replace(/\/$/, "");
  const subdomain =
    chatData?.customSubdomain ??
    generatePreviewSubdomain(context.userId, context.chatId);

  await deletePreviewSubdomain(subdomain, storagePrefix).catch((error) =>
    logger.warn(
      { error, chatId: context.chatId, subdomain, storagePrefix },
      "Failed to cleanup preview routing during chat deletion",
    ),
  );

  const activeSandboxId = await getActiveSandbox(context.chatId);
  if (activeSandboxId) {
    await cleanupSandbox(activeSandboxId).catch((error) =>
      logger.error(
        { error, chatId: context.chatId },
        "Failed to cleanup sandbox during chat deletion",
      ),
    );
  }

  const s3Prefix = buildS3Key(context.userId, context.chatId);
  await deleteFolder(s3Prefix).catch((error: unknown) =>
    logger.error(
      { error, chatId: context.chatId, s3Prefix },
      "Failed to cleanup S3 storage during chat deletion",
    ),
  );

  await deleteChatRecord(context.chatId);
}

export async function getRecentChatsUseCase(
  params: RecentChatsParams,
): Promise<{
  chats: Array<{
    id: string;
    userId: string;
    title: string | null;
    description: string | null;
    githubRepoFullName: string | null;
    customSubdomain: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  totalCount: number;
}> {
  const chats = await getRecentChatsByUser(params);
  const totalCount = await countChatsByUser(params.userId);
  return {
    chats,
    totalCount,
  };
}

export async function getChatMetaUseCase(
  context: ChatRequestContext,
): Promise<ChatMetaSummary> {
  let metaRow:
    | {
      title: string | null;
      description: string | null;
      seoTitle: string | null;
      seoDescription: string | null;
      updatedAt: Date;
    }
    | undefined;

  try {
    metaRow = await getChatMetaRecord(context.chatId);
  } catch (error) {
    if (!isMissingChatSeoColumnError(error)) {
      throw error;
    }

    const fallbackRow = await getChatMetaFallbackRecord(context.chatId);

    metaRow = fallbackRow
      ? {
        ...fallbackRow,
        seoTitle: fallbackRow.title,
        seoDescription: fallbackRow.description,
      }
      : undefined;
  }

  if (!metaRow) {
    throw new QueryUseCaseError({
      status: HttpStatus.NOT_FOUND,
      message: ERROR_MESSAGES.NOT_FOUND,
      code: "CHAT_NOT_FOUND",
    });
  }

  return {
    title: metaRow.title,
    description: metaRow.description,
    seoTitle: metaRow.seoTitle ?? metaRow.title,
    seoDescription: metaRow.seoDescription ?? metaRow.description,
    updatedAt: metaRow.updatedAt,
  };
}

function isMissingChatSeoColumnError(error: unknown): boolean {
  const errorText = error instanceof Error ? error.message : String(error);
  return (
    errorText.includes('column "seo_title" does not exist') ||
    errorText.includes('column "seo_description" does not exist')
  );
}
