import type { Response } from "express";
import { ParserEventType } from "../../schemas/chat.schema.js";
import type { WorkflowState } from "../../services/planning/schemas.js";

export function safeSSEWrite(res: Response, data: string): boolean {
    if (res.writableEnded || !res.writable) return false;
    res.write(data);
    return true;
}

export function emitPlanUpdate(
    res: Response,
    plan: WorkflowState["context"]["plan"],
): void {
    if (!plan || res.writableEnded) return;
    safeSSEWrite(
        res,
        `data: ${JSON.stringify({ type: ParserEventType.PLAN_UPDATE, plan })}\n\n`,
    );
    safeSSEWrite(
        res,
        `data: ${JSON.stringify({ type: ParserEventType.TODO_UPDATE, todos: plan.steps })}\n\n`,
    );
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
