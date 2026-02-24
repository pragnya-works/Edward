import { config } from "../app.config.js";

export const BUILD_QUEUE_NAME = "chat-processing-queue";
export const AGENT_RUN_QUEUE_NAME = "agent-run-queue";
export const connection = config.redis.connectionOptions;
