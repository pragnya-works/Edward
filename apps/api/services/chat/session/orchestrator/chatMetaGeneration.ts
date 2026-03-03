import type { MessageContent } from "@edward/shared/llm/types";
import { getTextFromContent } from "../../../../lib/llm/types.js";
import { generateResponse } from "../../../../lib/llm/provider.client.js";
import { updateChatMeta } from "../../../../services/chat.service.js";
import { logger } from "../../../../utils/logger.js";

interface ScheduleChatMetaGenerationParams {
  isFollowUp: boolean;
  decryptedApiKey: string;
  userContent: MessageContent;
  chatId: string;
}

export function scheduleChatMetaGeneration(
  params: ScheduleChatMetaGenerationParams,
): void {
  const { isFollowUp, decryptedApiKey, userContent, chatId } = params;
  if (isFollowUp) return;

  generateResponse(
    decryptedApiKey,
    `Generate a title and description for this chat based on the user's request. User said: "${getTextFromContent(userContent).slice(0, 500)}"

Return ONLY a JSON object: {"title": "...", "description": "..."}
- title: max 6 words, concise project name (e.g. "Cloud Storage Dashboard", "Portfolio Website")
- description: max 15 words, what the project does`,
    [],
    undefined,
    { jsonMode: true },
  )
    .then((resp) => {
      const match = resp.match(/\{[\s\S]*\}/);
      if (!match) return;
      const parsed = JSON.parse(match[0]);
      const title = parsed.title?.slice(0, 100);
      const description = parsed.description?.slice(0, 200);
      if (title || description) {
        return updateChatMeta(chatId, {
          title,
          description,
          seoTitle: title,
          seoDescription: description,
        });
      }
      return undefined;
    })
    .catch((err) =>
      logger.warn({ err, chatId }, "Title generation failed (non-fatal)"),
    );
}
