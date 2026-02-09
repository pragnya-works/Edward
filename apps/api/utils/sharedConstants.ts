export const NPM_PACKAGE_REGEX =
  /^(?:@[a-z0-9-][a-z0-9-._]*\/)?[a-z0-9-][a-z0-9-._]*$/;
export const MAX_DEPENDENCIES = 50;
export const MAX_PACKAGE_NAME_LENGTH = 214;
export const FRAMEWORKS = {
  NEXTJS: "nextjs",
  VITE_REACT: "vite-react",
  VANILLA: "vanilla",
} as const;

export type Framework = (typeof FRAMEWORKS)[keyof typeof FRAMEWORKS];
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
export const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
export const MAX_STREAM_DURATION_MS = 5 * 60 * 1000;
export const MAX_AGENT_TURNS = 5;
export const SANDBOX_TTL_MS = 30 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 60 * 1000;
