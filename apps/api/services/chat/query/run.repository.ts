import {
  and,
  ACTIVE_RUN_STATUSES,
  db,
  desc,
  eq,
  getRunById,
  inArray,
  run,
  RUN_STATUS,
} from "@edward/auth";

export type RunRecord = NonNullable<Awaited<ReturnType<typeof getRunById>>>;

export interface ActiveRunRecord {
  id: string;
  status: string;
  state: string | null;
  currentTurn: number | null;
  createdAt: Date;
  startedAt: Date | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
}

export async function getActiveRunRecord(params: {
  chatId: string;
  userId: string;
}): Promise<ActiveRunRecord | null> {
  const [activeRun] = await db
    .select({
      id: run.id,
      status: run.status,
      state: run.state,
      currentTurn: run.currentTurn,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      userMessageId: run.userMessageId,
      assistantMessageId: run.assistantMessageId,
    })
    .from(run)
    .where(
      and(
        eq(run.chatId, params.chatId),
        eq(run.userId, params.userId),
        inArray(run.status, ACTIVE_RUN_STATUSES),
      ),
    )
    .orderBy(desc(run.createdAt))
    .limit(1);

  return activeRun ?? null;
}

export async function getRunRecordById(
  runId: string,
): Promise<RunRecord | null> {
  return (await getRunById(runId)) ?? null;
}

export async function cancelActiveRun(params: {
  runId: string;
  cancellationRequestedAt: Date;
}): Promise<number> {
  const cancelledRows = await db
    .update(run)
    .set({
      status: RUN_STATUS.CANCELLED,
      state: "CANCELLED",
      completedAt: params.cancellationRequestedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(run.id, params.runId),
        inArray(run.status, ACTIVE_RUN_STATUSES),
      ),
    )
    .returning({ id: run.id });

  return cancelledRows.length;
}
