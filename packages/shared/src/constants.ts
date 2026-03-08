export enum Provider {
  OPENAI = "openai",
  GEMINI = "gemini",
  ANTHROPIC = "anthropic",
}

export enum GithubDisconnectReason {
  NONE = "none",
  NOT_CONNECTED = "not_connected",
  REPO_MISSING = "repo_missing",
  AUTH_MISSING = "auth_missing",
}

export const PROVIDER_DISPLAY_NAME = {
  [Provider.OPENAI]: "OpenAI",
  [Provider.GEMINI]: "Gemini",
  [Provider.ANTHROPIC]: "Anthropic",
} as const;

export const API_KEY_REGEX = {
  [Provider.OPENAI]: /^sk-(?:proj-[a-zA-Z0-9_-]{48,}|[a-zA-Z0-9]{48,})$/,
  [Provider.GEMINI]: /^AIza[a-zA-Z0-9_-]{35,}$/,
  [Provider.ANTHROPIC]: /^sk-ant-[a-zA-Z0-9_-]{10,}$/,
};

export const API_KEY_PLACEHOLDER = {
  [Provider.OPENAI]: "sk-proj-...",
  [Provider.GEMINI]: "AI...",
  [Provider.ANTHROPIC]: "sk-ant-...",
};

export const API_KEY_VALIDATION_ERROR = {
  [Provider.OPENAI]:
    "Invalid OpenAI API key format. Keys should start with 'sk-proj-' followed by alphanumeric characters, hyphens, and underscores.",
  [Provider.GEMINI]:
    "Invalid Gemini API key format. Keys should start with 'AIza' followed by alphanumeric characters, hyphens, and underscores.",
  [Provider.ANTHROPIC]:
    "Invalid Anthropic API key format. Keys should start with 'sk-ant-' followed by alphanumeric characters, hyphens, and underscores.",
};

export const API_KEY_LABEL = {
  [Provider.OPENAI]: `${PROVIDER_DISPLAY_NAME[Provider.OPENAI]} API Key`,
  [Provider.GEMINI]: `${PROVIDER_DISPLAY_NAME[Provider.GEMINI]} API Key`,
  [Provider.ANTHROPIC]: `${PROVIDER_DISPLAY_NAME[Provider.ANTHROPIC]} API Key`,
};

export const IMAGE_UPLOAD_CONFIG = {
  MAX_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_SIZE_MB: 5,
  ALLOWED_MIME_TYPES: ["image/jpeg", "image/png", "image/webp"] as const,
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".webp"] as const,
  MAX_FILES: 3,
} as const;

export const PROMPT_INPUT_CONFIG = {
  MAX_CHARS: 2000,
  WARNING_CHARS: 1800,
} as const;

export const SUBDOMAIN_RESERVED = new Set([
  "www",
  "api",
  "admin",
  "app",
  "mail",
  "dashboard",
  "ftp",
  "dev",
  "smtp",
  "staging",
  "preview",
  "static",
  "assets",
  "cdn",
  "media",
  "files",
  "storage",
]);

export const UI_EVENTS = {
  OPEN_API_KEY_MODAL: "edward:open-api-key-modal",
  FOCUS_PROMPT_INPUT: "edward:focus-prompt-input",
} as const;

export const RATE_LIMIT_SCOPE = {
  API_KEY: "apiKeyRateLimiter",
  CHAT_BURST: "chatRateLimiter",
  CHAT_DAILY: "dailyChatRateLimiter",
  CHAT_DAILY_QUOTA_READ: "dailyChatQuotaReadRateLimiter",
  IMAGE_UPLOAD_BURST: "imageUploadRateLimiter",
  GITHUB_BURST: "githubRateLimiter",
  GITHUB_DAILY: "dailyGithubRateLimiter",
  PROMPT_ENHANCE_BURST: "promptEnhanceRateLimiter",
} as const;

export const KNOWN_RATE_LIMIT_SCOPES = [
  RATE_LIMIT_SCOPE.API_KEY,
  RATE_LIMIT_SCOPE.CHAT_BURST,
  RATE_LIMIT_SCOPE.CHAT_DAILY,
  RATE_LIMIT_SCOPE.CHAT_DAILY_QUOTA_READ,
  RATE_LIMIT_SCOPE.IMAGE_UPLOAD_BURST,
  RATE_LIMIT_SCOPE.GITHUB_BURST,
  RATE_LIMIT_SCOPE.GITHUB_DAILY,
  RATE_LIMIT_SCOPE.PROMPT_ENHANCE_BURST,
] as const;

export type KnownRateLimitScope = (typeof KNOWN_RATE_LIMIT_SCOPES)[number];

export interface RateLimitPolicy {
  windowMs: number;
  max: number;
  redisPrefix: string;
  securityScope:
    | "api_key"
    | "chat_burst"
    | "chat_daily"
    | "chat_daily_quota_read"
    | "image_upload_burst"
    | "github_burst"
    | "github_daily"
    | "prompt_enhance_burst";
  limitExceededMessage: string;
}

export const RATE_LIMIT_POLICY_BY_SCOPE: Record<
  KnownRateLimitScope,
  RateLimitPolicy
> = {
  [RATE_LIMIT_SCOPE.API_KEY]: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    redisPrefix: "api-key",
    securityScope: "api_key",
    limitExceededMessage:
      "Too many API key update attempts. Please try again in 15 minutes.",
  },
  [RATE_LIMIT_SCOPE.CHAT_BURST]: {
    windowMs: 60 * 1000,
    max: 10,
    redisPrefix: "chat",
    securityScope: "chat_burst",
    limitExceededMessage: "Chat burst limit reached. Please wait a minute.",
  },
  [RATE_LIMIT_SCOPE.CHAT_DAILY]: {
    windowMs: 24 * 60 * 60 * 1000,
    max: 10,
    redisPrefix: "chat-daily",
    securityScope: "chat_daily",
    limitExceededMessage: "Daily message quota exceeded (10 messages/24h)",
  },
  [RATE_LIMIT_SCOPE.CHAT_DAILY_QUOTA_READ]: {
    windowMs: 60 * 1000,
    max: 30,
    redisPrefix: "chat-daily-quota-read",
    securityScope: "chat_daily_quota_read",
    limitExceededMessage: "Too many quota checks. Please wait a minute.",
  },
  [RATE_LIMIT_SCOPE.IMAGE_UPLOAD_BURST]: {
    windowMs: 60 * 1000,
    max: 6,
    redisPrefix: "chat-image-upload",
    securityScope: "image_upload_burst",
    limitExceededMessage:
      "Image upload limit reached. Maximum 6 uploads per minute.",
  },
  [RATE_LIMIT_SCOPE.GITHUB_BURST]: {
    windowMs: 60 * 1000,
    max: 20,
    redisPrefix: "github",
    securityScope: "github_burst",
    limitExceededMessage:
      "GitHub request burst limit reached. Please wait a minute.",
  },
  [RATE_LIMIT_SCOPE.GITHUB_DAILY]: {
    windowMs: 24 * 60 * 60 * 1000,
    max: 400,
    redisPrefix: "github-daily",
    securityScope: "github_daily",
    limitExceededMessage: "Daily GitHub quota exceeded (400 requests/24h).",
  },
  [RATE_LIMIT_SCOPE.PROMPT_ENHANCE_BURST]: {
    windowMs: 60 * 1000,
    max: 3,
    redisPrefix: "prompt-enhance",
    securityScope: "prompt_enhance_burst",
    limitExceededMessage:
      "Prompt enhancement limit reached. Maximum 3 enhancements per minute.",
  },
} as const;
