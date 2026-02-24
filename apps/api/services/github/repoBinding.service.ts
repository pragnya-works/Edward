import { and, chat, db, eq } from "@edward/auth";

export interface ChatRepoBinding {
  chatId: string;
  repoFullName: string | null;
}

export async function getChatRepoBinding(
  chatId: string,
  userId: string,
): Promise<ChatRepoBinding> {
  const [chatData] = await db
    .select({ chatId: chat.id, repoFullName: chat.githubRepoFullName })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!chatData) {
    throw new Error(
      "Chat not found or you do not have permission to access it",
    );
  }

  return chatData;
}

export async function clearChatRepoBinding(
  chatId: string,
  userId: string,
): Promise<void> {
  await db
    .update(chat)
    .set({ githubRepoFullName: null })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

export async function setChatRepoBinding(
  chatId: string,
  userId: string,
  repoFullName: string,
): Promise<void> {
  await db
    .update(chat)
    .set({ githubRepoFullName: repoFullName })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}
