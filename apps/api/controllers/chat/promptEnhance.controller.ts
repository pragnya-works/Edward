import type { Response } from "express";
import { Model, getProviderFromKey, getProviderFromModel } from "@edward/shared/schema";
import { Provider, PROMPT_INPUT_CONFIG } from "@edward/shared/constants";
import { generateResponse } from "../../lib/llm/provider.client.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../middleware/auth.js";
import { getUserWithApiKey } from "../../services/apiKey.service.js";
import { HttpStatus } from "../../utils/constants.js";
import { decrypt } from "../../utils/encryption.js";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import { sendError, sendSuccess } from "../../utils/response.js";

const ENHANCER_MODEL_BY_PROVIDER: Record<Provider, string> = {
  [Provider.OPENAI]: Model.GPT_5_NANO,
  [Provider.GEMINI]: Model.GEMINI_2_5_FLASH,
};

function isEnhancerProvider(provider: unknown): provider is Provider {
  return (
    typeof provider === "string" &&
    Object.prototype.hasOwnProperty.call(ENHANCER_MODEL_BY_PROVIDER, provider)
  );
}

const PROMPT_ENHANCER_SYSTEM_PROMPT = `
You are a prompt enhancement assistant for a coding/building agent.

Rewrite the user prompt to be clearer, more actionable, and implementation-ready.
Rules:
- Preserve original intent exactly.
- Keep constraints, tech stack, and important details.
- Remove ambiguity and filler.
- Output plain text ONLY. No markdown of any kind.
- Do NOT use headers (no #, ##, ###), bold (**text**), italic (*text*), bullet lists (- or *), numbered lists, code fences, or any other markdown syntax.
- Do NOT include labels like "Title:", "Objective:", "Requirements:", "Output:", etc.
- Write as a single, clear, flowing paragraph or a series of plain sentences.
- Keep it concise and practical.
- CRITICAL: Your entire output MUST be ${PROMPT_INPUT_CONFIG.MAX_CHARS} characters or fewer (hard limit). If needed, trim lower-priority details to stay within this limit. Never exceed ${PROMPT_INPUT_CONFIG.MAX_CHARS} characters.
`.trim();

function sanitizeEnhancedPrompt(raw: string): string {
  return raw
    .trim()
    .replace(/^```[\w-]*\n?/gm, "")
    .replace(/\n?```/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    .replace(/^(title|objective|goal|requirements?|constraints?|deliverables?|output|summary|description|notes?):\s*/gim, "")
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, PROMPT_INPUT_CONFIG.MAX_CHARS);
}

function resolveEnhancementProvider(params: {
  requestedProvider?: Provider | null;
  preferredModel?: string | null;
  apiKeyProvider: Provider | null;
}): Provider {
  const { requestedProvider, preferredModel, apiKeyProvider } = params;

  if (requestedProvider) {
    return requestedProvider;
  }

  const preferredModelProvider = preferredModel
    ? getProviderFromModel(preferredModel)
    : null;
  if (preferredModelProvider) {
    return preferredModelProvider;
  }

  if (apiKeyProvider) {
    return apiKeyProvider;
  }

  throw new Error("Unable to resolve provider for prompt enhancement.");
}

export async function enhancePrompt(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const inputText =
      typeof req.body?.text === "string" ? req.body.text.trim() : "";

    if (inputText.length < 30) {
      sendError(
        res,
        HttpStatus.BAD_REQUEST,
        "Prompt enhancement requires at least 30 characters.",
      );
      return;
    }

    if (inputText.length >= PROMPT_INPUT_CONFIG.MAX_CHARS) {
      sendError(
        res,
        HttpStatus.BAD_REQUEST,
        `Prompt is already at the ${PROMPT_INPUT_CONFIG.MAX_CHARS}-character limit. Please shorten it before enhancing.`,
      );
      return;
    }

    const userData = await getUserWithApiKey(userId);
    if (!userData?.apiKey) {
      sendError(
        res,
        HttpStatus.BAD_REQUEST,
        "API key configuration not found for this user.",
      );
      return;
    }

    const decryptedApiKey = decrypt(userData.apiKey);
    const apiKeyProvider = getProviderFromKey(decryptedApiKey);
    const requestedProvider = isEnhancerProvider(req.body?.provider)
      ? req.body.provider
      : null;
    if (req.body?.provider !== undefined && requestedProvider === null) {
      sendError(
        res,
        HttpStatus.BAD_REQUEST,
        "Selected provider is unsupported for prompt enhancement.",
      );
      return;
    }

    const resolvedProvider = resolveEnhancementProvider({
      requestedProvider,
      preferredModel: userData.preferredModel,
      apiKeyProvider,
    });

    if (apiKeyProvider && resolvedProvider !== apiKeyProvider) {
      sendError(
        res,
        HttpStatus.BAD_REQUEST,
        "Selected provider is incompatible with the saved API key.",
      );
      return;
    }

    const model = ENHANCER_MODEL_BY_PROVIDER[resolvedProvider];
    if (!model) {
      sendError(
        res,
        HttpStatus.BAD_REQUEST,
        "Selected provider is unsupported for prompt enhancement.",
      );
      return;
    }
    const enhancedRaw = await generateResponse(
      decryptedApiKey,
      inputText,
      undefined,
      PROMPT_ENHANCER_SYSTEM_PROMPT,
      { model },
    );
    const enhancedPrompt = sanitizeEnhancedPrompt(enhancedRaw);

    if (!enhancedPrompt) {
      sendError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Prompt enhancement failed to generate output.",
      );
      return;
    }

    sendSuccess(res, HttpStatus.OK, "Prompt enhanced successfully", {
      enhancedPrompt,
      provider: resolvedProvider,
      model,
    });
  } catch (error) {
    logger.error(ensureError(error), "enhancePrompt error");
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, "Prompt enhancement failed");
  }
}
