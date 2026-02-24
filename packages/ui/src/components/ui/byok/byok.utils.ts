import { OpenAI } from "@edward/ui/components/ui/openAi";
import { Gemini } from "@edward/ui/components/ui/gemini";
import {
  Provider,
  API_KEY_REGEX,
} from "@edward/shared/constants";
import type {
  BYOKProps,
  ResolvedBYOKProps,
} from "./byok.types";

export const PROVIDERS_CONFIG = [
  {
    id: Provider.OPENAI,
    label: "OpenAI",
    icon: OpenAI,
    description: "Use GPT-4, GPT-3.5, and other OpenAI models",
  },
  {
    id: Provider.GEMINI,
    label: "Gemini",
    icon: Gemini,
    description: "Use Google's Gemini Pro and Flash models",
  },
] as const;

export function validateApiKey(key: string, provider: Provider): boolean {
  if (!key.trim()) return false;
  return API_KEY_REGEX[provider].test(key);
}

export function getProviderFromKeyPreview(
  keyPreview?: string | null,
): Provider | null {
  if (!keyPreview) return null;
  const normalized = keyPreview.trim();
  if (normalized === "Existing Key") return null;
  if (normalized.startsWith("sk-")) return Provider.OPENAI;
  if (normalized.startsWith("AI")) return Provider.GEMINI;
  return null;
}

export function resolveByokProps(props: BYOKProps): ResolvedBYOKProps {
  if ("controller" in props) {
    return {
      isOpen: props.controller.modal.isOpen ?? false,
      onClose: props.controller.modal.onClose,
      onValidate: props.controller.actions.onValidate,
      onSaveApiKey: props.controller.actions.onSaveApiKey,
      externalError: props.controller.state?.error ?? "",
      initialApiKey: props.controller.state?.initialApiKey ?? "",
      initialProvider: props.controller.state?.initialProvider ?? Provider.OPENAI,
      keyPreview: props.controller.state?.keyPreview ?? null,
      hasExistingKey: props.controller.state?.hasExistingKey ?? false,
      preferredModel: props.controller.state?.preferredModel,
      onModelChange: props.controller.actions.onModelChange,
      isRateLimited: props.controller.state?.isRateLimited ?? false,
      rateLimitMessage: props.controller.state?.rateLimitMessage ?? "",
    };
  }

  return {
    isOpen: props.isOpen ?? false,
    onClose: props.onClose,
    onValidate: props.onValidate,
    onSaveApiKey: props.onSaveApiKey,
    externalError: props.error ?? "",
    initialApiKey: props.initialApiKey ?? "",
    initialProvider: props.initialProvider ?? Provider.OPENAI,
    keyPreview: props.keyPreview ?? null,
    hasExistingKey: props.hasExistingKey ?? false,
    preferredModel: props.preferredModel,
    onModelChange: props.onModelChange,
    isRateLimited: props.isRateLimited ?? false,
    rateLimitMessage: props.rateLimitMessage ?? "",
  };
}
