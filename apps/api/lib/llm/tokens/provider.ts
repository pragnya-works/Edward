import { API_KEY_REGEX, Provider } from "@edward/shared/constants";

export function inferProvider(apiKey: string): Provider {
  if (API_KEY_REGEX[Provider.OPENAI].test(apiKey)) return Provider.OPENAI;
  if (API_KEY_REGEX[Provider.GEMINI].test(apiKey)) return Provider.GEMINI;
  if (API_KEY_REGEX[Provider.ANTHROPIC].test(apiKey)) return Provider.ANTHROPIC;

  throw new Error(
    "Unrecognized API key format. Please provide a valid OpenAI, Gemini, or Anthropic API key.",
  );
}
