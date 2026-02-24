import type { Provider } from "@edward/shared/constants";

export interface BYOKState {
  apiKey: string;
  selectedProvider: Provider;
  selectedModel?: string;
  localError: string;
  isSubmitting: boolean;
  showPassword: boolean;
  showSuccess: boolean;
}

export type BYOKAction =
  | { type: "set-api-key"; payload: string }
  | { type: "set-provider"; payload: Provider }
  | { type: "set-model"; payload?: string }
  | { type: "set-local-error"; payload: string }
  | { type: "set-submitting"; payload: boolean }
  | { type: "toggle-password-visibility" }
  | { type: "set-show-success"; payload: boolean }
  | { type: "reset"; payload: BYOKState };

export function createInitialState(
  initialApiKey: string,
  initialProvider: Provider,
  preferredModel?: string,
): BYOKState {
  return {
    apiKey: initialApiKey,
    selectedProvider: initialProvider,
    selectedModel: preferredModel,
    localError: "",
    isSubmitting: false,
    showPassword: false,
    showSuccess: false,
  };
}

export function byokReducer(state: BYOKState, action: BYOKAction): BYOKState {
  switch (action.type) {
    case "set-api-key":
      return { ...state, apiKey: action.payload };
    case "set-provider":
      return { ...state, selectedProvider: action.payload };
    case "set-model":
      return { ...state, selectedModel: action.payload };
    case "set-local-error":
      return { ...state, localError: action.payload };
    case "set-submitting":
      return { ...state, isSubmitting: action.payload };
    case "toggle-password-visibility":
      return { ...state, showPassword: !state.showPassword };
    case "set-show-success":
      return { ...state, showSuccess: action.payload };
    case "reset":
      return action.payload;
    default:
      return state;
  }
}
