import { config } from "../config.js";

export const QUEUE_NAME = "chat-processing-queue";

export const connection = config.redis.connectionOptions;
