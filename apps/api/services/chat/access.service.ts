import type { Response } from "express";
import { chat, db, eq } from "@edward/auth";
import { ERROR_MESSAGES, HttpStatus } from "../../utils/constants.js";

export type ErrorResponder = (
  res: Response,
  status: HttpStatus,
  error: string,
) => void;

export function getChatIdOrRespond(
  rawChatId: unknown,
  res: Response,
  sendError: ErrorResponder,
): string | null {
  if (typeof rawChatId !== "string" || rawChatId.length === 0) {
    sendError(res, HttpStatus.BAD_REQUEST, "Invalid chat ID");
    return null;
  }

  return rawChatId;
}

export async function assertChatAccessOrRespond(
  chatId: string,
  userId: string,
  res: Response,
  sendError: ErrorResponder,
): Promise<boolean> {
  const [chatData] = await db
    .select({ userId: chat.userId })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);

  if (!chatData) {
    sendError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
    return false;
  }

  if (chatData.userId !== userId) {
    sendError(res, HttpStatus.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
    return false;
  }

  return true;
}
