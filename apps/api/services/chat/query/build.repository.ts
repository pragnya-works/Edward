import { getLatestBuildByChatId } from "@edward/auth";

export async function getLatestBuildRecord(chatId: string) {
  return (await getLatestBuildByChatId(chatId)) ?? null;
}
