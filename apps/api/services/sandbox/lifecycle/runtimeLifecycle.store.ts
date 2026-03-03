import { redis } from "../../../lib/redis.js";
import { logger } from "../../../utils/logger.js";

const SANDBOX_LIFECYCLE_KEY_PREFIX = "edward:sandbox:lifecycle:";

export enum SandboxLifecycleState {
  PROVISIONING = "provisioning",
  ACTIVE = "active",
  CLEANING_UP = "cleaning_up",
  TERMINATED = "terminated",
  FAILED = "failed",
}

interface SandboxLifecyclePayload {
  state: SandboxLifecycleState;
  updatedAt: number;
  reason?: string;
}

const ALLOWED_TRANSITIONS: Readonly<Record<SandboxLifecycleState, ReadonlySet<SandboxLifecycleState>>> = {
  [SandboxLifecycleState.PROVISIONING]: new Set([
    SandboxLifecycleState.ACTIVE,
    SandboxLifecycleState.FAILED,
    SandboxLifecycleState.CLEANING_UP,
  ]),
  [SandboxLifecycleState.ACTIVE]: new Set([
    SandboxLifecycleState.CLEANING_UP,
    SandboxLifecycleState.FAILED,
  ]),
  [SandboxLifecycleState.CLEANING_UP]: new Set([
    SandboxLifecycleState.TERMINATED,
    SandboxLifecycleState.FAILED,
  ]),
  [SandboxLifecycleState.TERMINATED]: new Set([SandboxLifecycleState.PROVISIONING]),
  [SandboxLifecycleState.FAILED]: new Set([
    SandboxLifecycleState.PROVISIONING,
    SandboxLifecycleState.CLEANING_UP,
    SandboxLifecycleState.TERMINATED,
  ]),
};

function lifecycleKey(sandboxId: string): string {
  return `${SANDBOX_LIFECYCLE_KEY_PREFIX}${sandboxId}`;
}

export async function getSandboxLifecycleState(
  sandboxId: string,
): Promise<SandboxLifecyclePayload | null> {
  let raw: string | null;
  try {
    raw = await redis.get(lifecycleKey(sandboxId));
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SandboxLifecyclePayload>;
    if (
      !isValidLifecycleState(parsed.state) ||
      typeof parsed.updatedAt !== "number"
    ) {
      await redis.del(lifecycleKey(sandboxId));
      return null;
    }

    return {
      state: parsed.state,
      updatedAt: parsed.updatedAt,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    await redis.del(lifecycleKey(sandboxId));
    return null;
  }
}

export async function transitionSandboxLifecycleState(params: {
  sandboxId: string;
  nextState: SandboxLifecycleState;
  reason?: string;
  allowFromMissing?: boolean;
}): Promise<boolean> {
  const current = await getSandboxLifecycleState(params.sandboxId);

  if (!current) {
    if (!params.allowFromMissing) {
      logger.warn(
        { sandboxId: params.sandboxId, nextState: params.nextState },
        "Skipping lifecycle transition because current state is missing",
      );
      return false;
    }

    await writeLifecycleState(params.sandboxId, {
      state: params.nextState,
      updatedAt: Date.now(),
      reason: params.reason,
    });
    return true;
  }

  if (!ALLOWED_TRANSITIONS[current.state].has(params.nextState)) {
    logger.warn(
      {
        sandboxId: params.sandboxId,
        currentState: current.state,
        attemptedState: params.nextState,
      },
      "Rejected invalid sandbox lifecycle transition",
    );
    return false;
  }

  await writeLifecycleState(params.sandboxId, {
    state: params.nextState,
    updatedAt: Date.now(),
    reason: params.reason,
  });
  return true;
}

async function writeLifecycleState(
  sandboxId: string,
  payload: SandboxLifecyclePayload,
): Promise<void> {
  await redis
    .set(lifecycleKey(sandboxId), JSON.stringify(payload), "EX", 24 * 60 * 60)
    .catch((error) =>
      logger.warn(
        { error, sandboxId, state: payload.state },
        "Failed to persist sandbox lifecycle state",
      ),
    );
}

function isValidLifecycleState(
  value: unknown,
): value is SandboxLifecycleState {
  return Object.values(SandboxLifecycleState).includes(
    value as SandboxLifecycleState,
  );
}
