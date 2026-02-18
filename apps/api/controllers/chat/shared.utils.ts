import type { Response } from "express";
import { db, chat, eq } from "@edward/auth";
import { ParserEventType } from "../../schemas/chat.schema.js";
import { HttpStatus, ERROR_MESSAGES } from "../../utils/constants.js";
import { sendError as sendStandardError } from "../../utils/response.js";

export type ErrorResponder = (
  res: Response,
  status: HttpStatus,
  error: string,
) => void;

export function sendStreamError(
  res: Response,
  status: HttpStatus,
  error: string,
): void {
  if (res.headersSent) {
    if (!res.writableEnded && res.writable) {
      res.write(
        `data: ${JSON.stringify({ type: ParserEventType.ERROR, message: error })}\n\n`,
      );
    }
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  sendStandardError(res, status, error);
}

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

export async function assertChatReadableOrRespond(
  chatId: string,
  userId: string,
  res: Response,
  sendError: ErrorResponder,
): Promise<boolean> {
  const [chatData] = await db
    .select({ userId: chat.userId, visibility: chat.visibility })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);

  if (!chatData) {
    sendError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
    return false;
  }

  if (chatData.userId !== userId && !chatData.visibility) {
    sendError(res, HttpStatus.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
    return false;
  }

  return true;
}

export async function assertChatOwnedOrRespond(
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
