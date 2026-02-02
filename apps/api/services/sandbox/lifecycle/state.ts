import { SANDBOX_LABEL } from '../docker.sandbox.js';

export const SANDBOX_TTL = 30 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 60 * 1000;
export const PROVISIONING_TIMEOUT_MS = 30000;
export const CONTAINER_STATUS_CACHE_MS = 10000;
export const SANDBOX_DOCKER_LABEL = SANDBOX_LABEL;

export let cleanupInterval: NodeJS.Timeout | null = null;
export const containerStatusCache = new Map<string, { alive: boolean; timestamp: number }>();

export function setCleanupInterval(timer: NodeJS.Timeout | null): void {
  cleanupInterval = timer;
}
