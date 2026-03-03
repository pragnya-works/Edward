import { redis } from "../../../lib/redis.js";
import { CONTAINER_STATUS_CACHE_MS } from "./state.js";

const CONTAINER_STATUS_KEY_PREFIX = "edward:sandbox:container-status:";

interface ContainerStatusCacheEntry {
  alive: boolean;
  timestamp: number;
}

function containerStatusKey(containerId: string): string {
  return `${CONTAINER_STATUS_KEY_PREFIX}${containerId}`;
}

export async function getContainerStatus(
  containerId: string,
): Promise<ContainerStatusCacheEntry | null> {
  let raw: string | null;
  try {
    raw = await redis.get(containerStatusKey(containerId));
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ContainerStatusCacheEntry>;
    if (typeof parsed.alive !== "boolean" || typeof parsed.timestamp !== "number") {
      await redis.del(containerStatusKey(containerId));
      return null;
    }
    return {
      alive: parsed.alive,
      timestamp: parsed.timestamp,
    };
  } catch {
    await redis.del(containerStatusKey(containerId));
    return null;
  }
}

export async function setContainerStatus(
  containerId: string,
  alive: boolean,
): Promise<void> {
  const payload: ContainerStatusCacheEntry = {
    alive,
    timestamp: Date.now(),
  };
  try {
    await redis.set(
      containerStatusKey(containerId),
      JSON.stringify(payload),
      "PX",
      CONTAINER_STATUS_CACHE_MS,
    );
  } catch {
    // best effort cache only
  }
}

export async function deleteContainerStatus(containerId: string): Promise<void> {
  await redis.del(containerStatusKey(containerId)).catch(() => {});
}
