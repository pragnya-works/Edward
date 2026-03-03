import {
  attachment,
  chat,
  count,
  db,
  desc,
  eq,
  inArray,
  message,
} from "@edward/auth";

export async function getMessagesByChatId(chatId: string) {
  return db
    .select()
    .from(message)
    .where(eq(message.chatId, chatId))
    .orderBy(message.createdAt);
}

export async function getAttachmentsByMessageIds(messageIds: string[]) {
  if (messageIds.length === 0) {
    return [] as Array<typeof attachment.$inferSelect>;
  }

  return db
    .select()
    .from(attachment)
    .where(inArray(attachment.messageId, messageIds));
}

export async function getChatSubdomainRecord(chatId: string): Promise<{
  customSubdomain: string | null;
} | null> {
  const [chatData] = await db
    .select({ customSubdomain: chat.customSubdomain })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);

  return chatData ?? null;
}

export async function deleteChatRecord(chatId: string): Promise<void> {
  await db.delete(chat).where(eq(chat.id, chatId));
}

export async function getRecentChatsByUser(params: {
  userId: string;
  limit: number;
  offset: number;
}) {
  return db
    .select({
      id: chat.id,
      userId: chat.userId,
      title: chat.title,
      description: chat.description,
      githubRepoFullName: chat.githubRepoFullName,
      customSubdomain: chat.customSubdomain,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    })
    .from(chat)
    .where(eq(chat.userId, params.userId))
    .orderBy(desc(chat.updatedAt))
    .limit(params.limit)
    .offset(params.offset);
}

export async function countChatsByUser(userId: string): Promise<number> {
  const [countResult] = await db
    .select({ count: count() })
    .from(chat)
    .where(eq(chat.userId, userId));

  return Number(countResult?.count ?? 0);
}

export async function getChatMetaRecord(chatId: string): Promise<
  | {
    title: string | null;
    description: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    updatedAt: Date;
  }
  | undefined
> {
  const [metaRow] = await db
    .select({
      title: chat.title,
      description: chat.description,
      seoTitle: chat.seoTitle,
      seoDescription: chat.seoDescription,
      updatedAt: chat.updatedAt,
    })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);

  return metaRow;
}

export async function getChatMetaFallbackRecord(chatId: string): Promise<
  | {
    title: string | null;
    description: string | null;
    updatedAt: Date;
  }
  | undefined
> {
  const [metaRow] = await db
    .select({
      title: chat.title,
      description: chat.description,
      updatedAt: chat.updatedAt,
    })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);

  return metaRow;
}
