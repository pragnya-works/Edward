import { redis } from "../../../lib/redis.js";
import { logger } from "../../../utils/logger.js";

const SANDBOX_LIFECYCLE_KEY_PREFIX = "edward:sandbox:lifecycle:";
const LIFECYCLE_TTL_SECONDS = 24 * 60 * 60;
const TRANSITION_LUA = `
local key = KEYS[1]
local nextState = ARGV[1]
local updatedAt = tonumber(ARGV[2])
local reason = ARGV[3]
local allowFromMissing = ARGV[4] == "1"
local ttl = tonumber(ARGV[5])

local raw = redis.call("GET", key)
local currentState = nil

if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if not ok or type(decoded) ~= "table" or type(decoded.state) ~= "string" then
    if not allowFromMissing then
      return {0, "invalid_payload"}
    end
  else
    currentState = decoded.state
  end
else
  if not allowFromMissing then
    return {0, "missing"}
  end
end

if currentState ~= nil then
  local allowed = false
  if currentState == "provisioning" then
    allowed = nextState == "active" or nextState == "failed" or nextState == "cleaning_up"
  elseif currentState == "active" then
    allowed = nextState == "cleaning_up" or nextState == "failed"
  elseif currentState == "cleaning_up" then
    allowed = nextState == "terminated" or nextState == "failed"
  elseif currentState == "terminated" then
    allowed = nextState == "provisioning"
  elseif currentState == "failed" then
    allowed = nextState == "provisioning" or nextState == "cleaning_up" or nextState == "terminated"
  else
    if not allowFromMissing then
      return {0, "invalid_state", currentState}
    end
    currentState = nil
  end

  if currentState ~= nil and not allowed then
    return {0, "invalid_transition", currentState}
  end
end

local payload = {
  state = nextState,
  updatedAt = updatedAt,
}
if reason ~= "" then
  payload.reason = reason
end

redis.call("SET", key, cjson.encode(payload), "EX", ttl)
return {1}
`;

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

  const parsed = parseLifecyclePayload(raw);
  if (!parsed) {
    await redis.del(lifecycleKey(sandboxId));
    return null;
  }

  return parsed;
}

export async function transitionSandboxLifecycleState(params: {
  sandboxId: string;
  nextState: SandboxLifecycleState;
  reason?: string;
  allowFromMissing?: boolean;
}): Promise<boolean> {
  try {
    const result = await redis.eval(
      TRANSITION_LUA,
      1,
      lifecycleKey(params.sandboxId),
      params.nextState,
      String(Date.now()),
      params.reason ?? "",
      params.allowFromMissing ? "1" : "0",
      String(LIFECYCLE_TTL_SECONDS),
    );
    const [appliedRaw, reasonRaw, currentStateRaw] = Array.isArray(result)
      ? result
      : [0, "unexpected_reply"];
    if (Number(appliedRaw) === 1) {
      return true;
    }

    const reason =
      typeof reasonRaw === "string" ? reasonRaw : "unknown_rejection";
    if (reason === "missing") {
      logger.warn(
        { sandboxId: params.sandboxId, nextState: params.nextState },
        "Skipping lifecycle transition because current state is missing",
      );
    } else if (reason === "invalid_transition") {
      logger.warn(
        {
          sandboxId: params.sandboxId,
          currentState: currentStateRaw,
          attemptedState: params.nextState,
        },
        "Rejected invalid sandbox lifecycle transition",
      );
    } else {
      logger.warn(
        {
          sandboxId: params.sandboxId,
          nextState: params.nextState,
          reason,
        },
        "Lifecycle transition was rejected",
      );
    }
    return false;
  } catch (error) {
    logger.warn(
      {
        error,
        sandboxId: params.sandboxId,
        nextState: params.nextState,
      },
      "Failed to persist sandbox lifecycle transition",
    );
    return false;
  }
}

function isValidLifecycleState(
  value: unknown,
): value is SandboxLifecycleState {
  switch (value) {
    case SandboxLifecycleState.PROVISIONING:
    case SandboxLifecycleState.ACTIVE:
    case SandboxLifecycleState.CLEANING_UP:
    case SandboxLifecycleState.TERMINATED:
    case SandboxLifecycleState.FAILED:
      return true;
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseLifecyclePayload(raw: string): SandboxLifecyclePayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    const state = parsed.state;
    const updatedAt = parsed.updatedAt;
    const reason = parsed.reason;

    if (
      !isValidLifecycleState(state) ||
      typeof updatedAt !== "number"
    ) {
      return null;
    }

    return {
      state,
      updatedAt,
      reason: typeof reason === "string" ? reason : undefined,
    };
  } catch {
    return null;
  }
}
