const DEFAULT_CHAT_TITLE = "New Chat";
const DEFAULT_CHAT_DESCRIPTION = "Start building with Edward.";
const IMAGE_ONLY_CHAT_TITLE = "Image-based App Request";
const IMAGE_ONLY_CHAT_DESCRIPTION =
  "Build an app based on the uploaded image requirements.";
const TITLE_WORD_LIMIT = 6;
const DESCRIPTION_WORD_LIMIT = 15;
const TITLE_CHAR_LIMIT = 100;
const DESCRIPTION_CHAR_LIMIT = 200;

export interface DeriveInitialChatMetadataParams {
  userTextContent: string;
  hasImages: boolean;
}

export interface ChatMetadataSeed {
  title: string;
  description: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripFormatting(value: string): string {
  let normalized = value;
  normalized = normalized.replace(/```[\s\S]*?```/g, " ");
  normalized = normalized.replace(/`[^`]*`/g, " ");
  normalized = normalized.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1 ");
  normalized = normalized.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1 ");
  normalized = normalized.replace(/^#{1,6}\s+/gm, "");
  normalized = normalized.replace(/^\s*[-*+]\s+/gm, "");
  normalized = normalized.replace(/^\s*\d+\.\s+/gm, "");
  normalized = normalized.replace(/https?:\/\/\S+/gi, " ");
  return normalizeWhitespace(normalized);
}

function extractWords(value: string): string[] {
  return value.match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g) ?? [];
}

function toTitleWord(word: string): string {
  if (word.length <= 4 && word === word.toUpperCase()) {
    return word;
  }
  if (/[A-Z]/.test(word.slice(1))) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function capitalizeFirst(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function truncateAtWordBoundary(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const truncated = value.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace <= 0) {
    return truncated.trim();
  }
  return truncated.slice(0, lastSpace).trim();
}

export function deriveInitialChatMetadata(
  params: DeriveInitialChatMetadataParams,
): ChatMetadataSeed {
  const cleaned = stripFormatting(params.userTextContent);
  const sentenceCandidate =
    cleaned.split(/[.!?\n:;]/).find((part) => normalizeWhitespace(part).length > 0) ??
    cleaned;

  const sentenceWords = extractWords(sentenceCandidate);
  const allWords = extractWords(cleaned);

  if (allWords.length === 0) {
    if (params.hasImages) {
      return {
        title: IMAGE_ONLY_CHAT_TITLE,
        description: IMAGE_ONLY_CHAT_DESCRIPTION,
      };
    }
    return {
      title: DEFAULT_CHAT_TITLE,
      description: DEFAULT_CHAT_DESCRIPTION,
    };
  }

  const titleWords = (sentenceWords.length > 0 ? sentenceWords : allWords)
    .slice(0, TITLE_WORD_LIMIT)
    .map(toTitleWord);
  const title = truncateAtWordBoundary(
    titleWords.join(" ").trim() || DEFAULT_CHAT_TITLE,
    TITLE_CHAR_LIMIT,
  );

  const descriptionWords = allWords.slice(0, DESCRIPTION_WORD_LIMIT);
  const descriptionText = capitalizeFirst(descriptionWords.join(" "));
  const description = truncateAtWordBoundary(
    descriptionText || DEFAULT_CHAT_DESCRIPTION,
    DESCRIPTION_CHAR_LIMIT,
  );

  return {
    title: title || DEFAULT_CHAT_TITLE,
    description: description || DEFAULT_CHAT_DESCRIPTION,
  };
}
