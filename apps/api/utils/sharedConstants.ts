/**
 * Shared constants used across the API
 * This module serves as the single source of truth for regex patterns,
 * validation rules, and other shared constants.
 */

/**
 * NPM package name validation regex
 * Supports scoped packages (@scope/name) and regular packages
 * Follows NPM naming conventions
 */
export const NPM_PACKAGE_REGEX =
  /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

/**
 * Maximum number of dependencies allowed in a single install request
 */
export const MAX_DEPENDENCIES = 50;

/**
 * Maximum length of an NPM package name (NPM's actual limit)
 */
export const MAX_PACKAGE_NAME_LENGTH = 214;

/**
 * Framework identifiers - single source of truth
 */
export const FRAMEWORKS = {
  NEXTJS: "nextjs",
  VITE_REACT: "vite-react",
  VANILLA: "vanilla",
} as const;

export type Framework = (typeof FRAMEWORKS)[keyof typeof FRAMEWORKS];

/**
 * Maximum file size for uploads (10MB)
 */
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

/**
 * Maximum response size from LLM (10MB)
 */
export const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum stream duration (5 minutes)
 */
export const MAX_STREAM_DURATION_MS = 5 * 60 * 1000;

/**
 * Maximum agent turns in conversation
 */
export const MAX_AGENT_TURNS = 5;

/**
 * Sandbox TTL (30 minutes)
 */
export const SANDBOX_TTL_MS = 30 * 60 * 1000;

/**
 * Cleanup interval (1 minute)
 */
export const CLEANUP_INTERVAL_MS = 60 * 1000;
