import { nanoid } from "nanoid";
import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "./db.js";
import { run, runEvent, runToolCall } from "./schema.js";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type RunState =
  | "INIT"
  | "LLM_STREAM"
  | "TOOL_EXEC"
  | "APPLY"
  | "NEXT_TURN"
  | "COMPLETE"
  | "FAILED"
  | "CANCELLED";

interface CreateRunInput {
  chatId: string;
  userId: string;
  userMessageId: string;
  assistantMessageId: string;
  model?: string;
  intent?: string;
  metadata?: Record<string, unknown>;
}

export async function createRunWithUserLimit(
  data: CreateRunInput,
  maxActiveRuns: number,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${data.userId}))`);

    const [activeCountResult] = await tx
      .select({ value: count() })
      .from(run)
      .where(
        and(
          eq(run.userId, data.userId),
          inArray(run.status, ["queued", "running"]),
        ),
      );

    const activeRuns = Number(activeCountResult?.value ?? 0);
    if (activeRuns >= maxActiveRuns) {
      return null;
    }

    const id = nanoid(24);
    const inserted = await tx
      .insert(run)
      .values({
        id,
        chatId: data.chatId,
        userId: data.userId,
        userMessageId: data.userMessageId,
        assistantMessageId: data.assistantMessageId,
        model: data.model,
        intent: data.intent,
        metadata: data.metadata ?? null,
        status: "queued",
        state: "INIT",
      })
      .returning();

    return inserted[0] ?? null;
  });
}

export async function getRunById(runId: string) {
  return db.query.run.findFirst({ where: eq(run.id, runId) });
}

export async function updateRun(
  runId: string,
  data: Partial<{
    status: RunStatus;
    state: RunState;
    currentTurn: number;
    loopStopReason: string | null;
    terminationReason: string | null;
    errorMessage: string | null;
    metadata: Record<string, unknown> | null;
    startedAt: Date | null;
    completedAt: Date | null;
  }>,
) {
  const updated = await db
    .update(run)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(run.id, runId))
    .returning();

  return updated[0];
}

export async function appendRunEvent(data: {
  runId: string;
  eventType: string;
  event: Record<string, unknown>;
}) {
  return db.transaction(async (tx) => {
    const nextSeqRow = await tx
      .update(run)
      .set({
        nextEventSeq: sql`${run.nextEventSeq} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(run.id, data.runId))
      .returning({ seq: run.nextEventSeq });

    const seq = nextSeqRow[0]?.seq;
    if (typeof seq !== "number") {
      throw new Error(`Run not found while appending event: ${data.runId}`);
    }

    const eventId = `${data.runId}:${seq}`;
    const inserted = await tx
      .insert(runEvent)
      .values({
        id: eventId,
        runId: data.runId,
        seq,
        eventType: data.eventType,
        event: data.event,
      })
      .returning();

    return inserted[0];
  });
}

export async function getRunEventsAfter(
  runId: string,
  afterSeq: number,
  limit = 500,
) {
  return db
    .select()
    .from(runEvent)
    .where(and(eq(runEvent.runId, runId), gt(runEvent.seq, afterSeq)))
    .orderBy(asc(runEvent.seq))
    .limit(limit);
}

export async function getLatestSessionCompleteEvent(runId: string) {
  const rows = await db
    .select()
    .from(runEvent)
    .where(
      and(
        eq(runEvent.runId, runId),
        eq(runEvent.eventType, "meta"),
        sql`${runEvent.event} ->> 'phase' = 'session_complete'`,
      ),
    )
    .orderBy(desc(runEvent.seq))
    .limit(1);

  return rows[0];
}

export async function upsertRunToolCall(data: {
  runId: string;
  turn: number;
  toolName: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  status: "started" | "succeeded" | "failed";
  errorMessage?: string | null;
  durationMs?: number | null;
}) {
  const result = await db
    .insert(runToolCall)
    .values({
      id: nanoid(24),
      runId: data.runId,
      turn: data.turn,
      toolName: data.toolName,
      idempotencyKey: data.idempotencyKey,
      input: data.input,
      output: data.output ?? null,
      status: data.status,
      errorMessage: data.errorMessage ?? null,
      durationMs: data.durationMs ?? null,
    })
    .onConflictDoUpdate({
      target: [runToolCall.runId, runToolCall.idempotencyKey],
      set: {
        turn: data.turn,
        status: data.status,
        input: data.input,
        output: data.output != null ? data.output : sql`${runToolCall.output}`,
        errorMessage: data.errorMessage ?? null,
        durationMs: data.durationMs ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return result[0];
}

export async function getRunToolCallByIdempotencyKey(
  runId: string,
  idempotencyKey: string,
) {
  return db.query.runToolCall.findFirst({
    where: and(
      eq(runToolCall.runId, runId),
      eq(runToolCall.idempotencyKey, idempotencyKey),
    ),
  });
}
