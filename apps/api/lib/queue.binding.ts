import { config } from "../app.config.js";

/**
 * Raw queue transport bindings shared by queue producers/consumers.
 *
 * Boundary rule:
 * - This module should expose only infrastructure wiring primitives
 *   (queue name + Redis connection options).
 * - Business/job orchestration lives in `services/queue/*`.
 */
export const QUEUE_NAME = "chat-processing-queue";

export const connection = config.redis.connectionOptions;
