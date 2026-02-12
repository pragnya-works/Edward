import type { Response } from "express";
import { ParserEventType } from "../../schemas/chat.schema.js";

export function safeSSEWrite(res: Response, data: string): boolean {
    if (res.writableEnded || !res.writable) return false;
    res.write(data);
    return true;
}

export function sendSSEError(res: Response, message: string): boolean {
    return safeSSEWrite(
        res,
        `data: ${JSON.stringify({ type: ParserEventType.ERROR, message })}\n\n`,
    );
}

export function sendSSEDone(res: Response): void {
    safeSSEWrite(res, "data: [DONE]\n\n");
    if (!res.writableEnded) {
        res.end();
    }
}
