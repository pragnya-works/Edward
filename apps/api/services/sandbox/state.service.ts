import { redis } from "../../lib/redis.js";
import type { SandboxInstance } from "./types.service.js";
import { logger } from "../../utils/logger.js";
import { SANDBOX_TTL } from "./lifecycle/state.js";

const SANDBOX_KEY_PREFIX = "edward:sandbox:";
const CHAT_SANDBOX_INDEX_PREFIX = "edward:chat:sandbox:";
const CONTAINER_SANDBOX_INDEX_PREFIX = "edward:container:sandbox:";
const CHAT_FRAMEWORK_PREFIX = "edward:chat:framework:";
const FRAMEWORK_TTL = 7 * 24 * 60 * 60;

export async function saveSandboxState(sandbox: SandboxInstance): Promise<void> {
  const snapshot = cloneSandboxState(sandbox);

  try {
    const key = `${SANDBOX_KEY_PREFIX}${snapshot.id}`;
    const pipeline = redis.pipeline();
    pipeline.set(key, JSON.stringify(snapshot), "PX", SANDBOX_TTL);
    pipeline.set(
      `${CHAT_SANDBOX_INDEX_PREFIX}${snapshot.chatId}`,
      snapshot.id,
      "PX",
      SANDBOX_TTL,
    );
    pipeline.set(
      `${CONTAINER_SANDBOX_INDEX_PREFIX}${snapshot.containerId}`,
      snapshot.id,
      "PX",
      SANDBOX_TTL,
    );
    if (snapshot.scaffoldedFramework) {
      pipeline.set(
        `${CHAT_FRAMEWORK_PREFIX}${snapshot.chatId}`,
        snapshot.scaffoldedFramework,
        "EX",
        FRAMEWORK_TTL,
      );
    }
    const results = await pipeline.exec();
    if (!results) {
      throw new Error("Redis pipeline returned null while saving sandbox state");
    }
    for (const [error] of results) {
      if (error) {
        throw error;
      }
    }
  } catch (error) {
    logger.error({ error, sandboxId: snapshot.id }, "Failed to save sandbox state to Redis");
    throw new Error("Failed to persist sandbox state");
  }
}

export async function getSandboxState(
  sandboxId: string,
): Promise<SandboxInstance | null> {
  try {
    const key = `${SANDBOX_KEY_PREFIX}${sandboxId}`;
    const data = await redis.get(key);
    if (!data) {
      return null;
    }

    const parsed = parseSandboxState(data);
    if (!parsed) {
      await redis.del(key);
      return null;
    }

    return cloneSandboxState(parsed);
  } catch (error) {
    logger.error({ error, sandboxId }, "Failed to get sandbox state from Redis");
    return null;
  }
}

export async function deleteSandboxState(
  sandboxId: string,
  chatId?: string,
): Promise<void> {
  try {
    const existingState = await getSandboxState(sandboxId);
    const resolvedChatId =
      chatId ?? existingState?.chatId ?? null;
    const containerId = existingState?.containerId;
    await redis.del(`${SANDBOX_KEY_PREFIX}${sandboxId}`);
    if (resolvedChatId) {
      await redis.del(`${CHAT_SANDBOX_INDEX_PREFIX}${resolvedChatId}`);
    }
    if (containerId) {
      await redis.del(`${CONTAINER_SANDBOX_INDEX_PREFIX}${containerId}`);
    }
  } catch (error) {
    logger.error({ error, sandboxId }, "Failed to delete sandbox state from Redis");
  }
}

async function getSandboxIdByChat(chatId: string): Promise<string | null> {
  try {
    return await redis.get(`${CHAT_SANDBOX_INDEX_PREFIX}${chatId}`);
  } catch (error) {
    logger.error({ error, chatId }, "Failed to get sandbox ID by chat from Redis");
    return null;
  }
}

export async function getActiveSandboxState(
  chatId: string,
): Promise<SandboxInstance | null> {
  try {
    const sandboxId = await getSandboxIdByChat(chatId);
    if (!sandboxId) {
      return null;
    }
    return await getSandboxState(sandboxId);
  } catch (error) {
    logger.error({ error, chatId }, "Failed to get active sandbox state");
    return null;
  }
}

export async function getSandboxStateByContainerId(
  containerId: string,
): Promise<SandboxInstance | null> {
  try {
    const sandboxId = await redis.get(`${CONTAINER_SANDBOX_INDEX_PREFIX}${containerId}`);
    if (!sandboxId) {
      return null;
    }
    return await getSandboxState(sandboxId);
  } catch (error) {
    logger.error({ error, containerId }, "Failed to get sandbox state by container");
    return null;
  }
}

export async function refreshSandboxTTL(
  sandboxId: string,
  chatId?: string,
): Promise<void> {
  try {
    const state = await getSandboxState(sandboxId);
    const pipeline = redis.pipeline();
    pipeline.pexpire(`${SANDBOX_KEY_PREFIX}${sandboxId}`, SANDBOX_TTL);
    if (chatId) {
      pipeline.pexpire(`${CHAT_SANDBOX_INDEX_PREFIX}${chatId}`, SANDBOX_TTL);
    }
    if (state?.containerId) {
      pipeline.pexpire(
        `${CONTAINER_SANDBOX_INDEX_PREFIX}${state.containerId}`,
        SANDBOX_TTL,
      );
    }
    await pipeline.exec();
  } catch (error) {
    logger.error({ error, sandboxId }, "Failed to refresh sandbox TTL");
  }
}

export async function getChatFramework(chatId: string): Promise<string | null> {
  try {
    return await redis.get(`${CHAT_FRAMEWORK_PREFIX}${chatId}`);
  } catch (error) {
    logger.warn({ error, chatId }, "Failed to get chat framework from Redis");
    return null;
  }
}

function parseSandboxState(raw: string): SandboxInstance | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidate = parsed as Partial<SandboxInstance>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.containerId !== "string" ||
    typeof candidate.expiresAt !== "number" ||
    !Number.isFinite(candidate.expiresAt) ||
    typeof candidate.userId !== "string" ||
    typeof candidate.chatId !== "string"
  ) {
    return null;
  }

  if (
    candidate.scaffoldedFramework !== undefined &&
    typeof candidate.scaffoldedFramework !== "string"
  ) {
    return null;
  }

  if (
    candidate.requestedPackages !== undefined &&
    !isStringArray(candidate.requestedPackages)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    containerId: candidate.containerId,
    expiresAt: candidate.expiresAt,
    userId: candidate.userId,
    chatId: candidate.chatId,
    scaffoldedFramework: candidate.scaffoldedFramework,
    requestedPackages: candidate.requestedPackages
      ? [...candidate.requestedPackages]
      : undefined,
  };
}

function cloneSandboxState(sandbox: SandboxInstance): SandboxInstance {
  return {
    id: sandbox.id,
    containerId: sandbox.containerId,
    expiresAt: sandbox.expiresAt,
    userId: sandbox.userId,
    chatId: sandbox.chatId,
    scaffoldedFramework: sandbox.scaffoldedFramework,
    requestedPackages: sandbox.requestedPackages
      ? [...sandbox.requestedPackages]
      : undefined,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
