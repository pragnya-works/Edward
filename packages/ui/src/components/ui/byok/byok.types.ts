import type { Provider } from "@edward/shared/constants";

export interface BYOKLegacyProps {
  isOpen?: boolean;
  onClose: () => void;
  onValidate: (key: string) => void;
  onSaveApiKey?: (
    apiKey: string,
    onValidate: (key: string) => void,
    onClose: () => void,
    provider: Provider,
    model?: string,
  ) => Promise<boolean>;
  error?: string;
  initialApiKey?: string;
  initialProvider?: Provider;
  preferredModel?: string;
  keyPreview?: string | null;
  hasExistingKey?: boolean;
  onModelChange?: (modelId: string) => void;
  isRateLimited?: boolean;
  rateLimitMessage?: string;
}

export interface BYOKController {
  modal: {
    isOpen?: boolean;
    onClose: () => void;
  };
  actions: {
    onValidate: (key: string) => void;
    onSaveApiKey?: (
      apiKey: string,
      onValidate: (key: string) => void,
      onClose: () => void,
      provider: Provider,
      model?: string,
    ) => Promise<boolean>;
    onModelChange?: (modelId: string) => void;
  };
  state?: {
    error?: string;
    initialApiKey?: string;
    initialProvider?: Provider;
    preferredModel?: string;
    keyPreview?: string | null;
    hasExistingKey?: boolean;
    isRateLimited?: boolean;
    rateLimitMessage?: string;
  };
}

export interface BYOKControllerProps {
  controller: BYOKController;
}

export type BYOKProps = BYOKLegacyProps | BYOKControllerProps;

export interface ResolvedBYOKProps {
  isOpen: boolean;
  onClose: () => void;
  onValidate: (key: string) => void;
  onSaveApiKey?: (
    apiKey: string,
    onValidate: (key: string) => void,
    onClose: () => void,
    provider: Provider,
    model?: string,
  ) => Promise<boolean>;
  externalError: string;
  initialApiKey: string;
  initialProvider: Provider;
  keyPreview: string | null;
  hasExistingKey: boolean;
  preferredModel?: string;
  onModelChange?: (modelId: string) => void;
  isRateLimited: boolean;
  rateLimitMessage: string;
}
