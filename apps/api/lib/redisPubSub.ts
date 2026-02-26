import { createRedisClient } from "./redis.js";
import { logger } from "../utils/logger.js";
const subscriber = createRedisClient();
const handlersByChannel = new Map<string, Set<(payload: string) => void>>();

let listenerAttached = false;
let closingPromise: Promise<void> | null = null;

function ensureListenerAttached(): void {
  if (listenerAttached) {
    return;
  }

  subscriber.on("message", (channel: string, payload: string) => {
    const handlers = handlersByChannel.get(channel);
    if (!handlers || handlers.size === 0) {
      return;
    }

    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        logger.warn(
          { error, channel },
          "Redis pub/sub handler failed",
        );
      }
    }
  });

  subscriber.on("error", (error: unknown) => {
    logger.error({ error }, "Redis pub/sub subscriber error");
  });

  listenerAttached = true;
}

export async function subscribeToRedisChannel(
  channel: string,
  handler: (payload: string) => void,
): Promise<() => Promise<void>> {
  ensureListenerAttached();

  let handlers = handlersByChannel.get(channel);
  const isFirstHandler = !handlers;
  if (!handlers) {
    handlers = new Set<(payload: string) => void>();
    handlersByChannel.set(channel, handlers);
  }
  handlers.add(handler);

  if (isFirstHandler) {
    await subscriber.subscribe(channel);
  }

  let active = true;
  return async () => {
    if (!active) {
      return;
    }
    active = false;

    const channelHandlers = handlersByChannel.get(channel);
    if (!channelHandlers) {
      return;
    }

    channelHandlers.delete(handler);
    if (channelHandlers.size > 0) {
      return;
    }

    handlersByChannel.delete(channel);
    try {
      await subscriber.unsubscribe(channel);
    } catch (error) {
      logger.warn(
        { error, channel },
        "Failed to unsubscribe Redis channel",
      );
    }
  };
}

export async function shutdownRedisPubSub(): Promise<void> {
  if (closingPromise) {
    await closingPromise;
    return;
  }

  closingPromise = (async () => {
    const channels = [...handlersByChannel.keys()];
    handlersByChannel.clear();

    if (channels.length > 0) {
      await subscriber.unsubscribe(...channels).catch((error: unknown) => {
        logger.warn(
          { error, channels },
          "Failed to unsubscribe Redis pub/sub channels during shutdown",
        );
      });
    }

    await subscriber.quit().catch((error: unknown) => {
      logger.warn(
        { error },
        "Failed to quit Redis pub/sub subscriber during shutdown",
      );
    });
  })();

  await closingPromise;
}
