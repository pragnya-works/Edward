export enum Provider {
  OPENAI = "openai",
  GEMINI = "gemini",
}

export const API_KEY_REGEX = {
  [Provider.OPENAI]: /^sk-(?:proj-[a-zA-Z0-9_-]{48,}|[a-zA-Z0-9]{48,})$/,
  [Provider.GEMINI]: /^AIza[a-zA-Z0-9_-]{35,}$/,
};

export const API_KEY_PLACEHOLDER = {
  [Provider.OPENAI]: "sk-proj-...",
  [Provider.GEMINI]: "AI...",
};

export const API_KEY_VALIDATION_ERROR = {
  [Provider.OPENAI]:
    "Invalid OpenAI API key format. Keys should start with 'sk-proj-' followed by alphanumeric characters, hyphens, and underscores.",
  [Provider.GEMINI]:
    "Invalid Gemini API key format. Keys should start with 'AIza' followed by alphanumeric characters, hyphens, and underscores.",
};

export const API_KEY_LABEL = {
  [Provider.OPENAI]: "OpenAI API Key",
  [Provider.GEMINI]: "Gemini API Key",
};

export const IMAGE_UPLOAD_CONFIG = {
  MAX_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_SIZE_MB: 5,
  ALLOWED_MIME_TYPES: ["image/jpeg", "image/png", "image/webp"] as const,
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".webp"] as const,
  MAX_FILES: 3,
} as const;