"use client";

import Promptbar from "@edward/ui/components/ui/promptbar";
import { useSession, signIn } from "@/lib/auth-client";
import { useApiKey } from "@/hooks/useApiKey";

interface AuthenticatedPromptbarProps {
  onProtectedAction?: (files?: File[]) => void | Promise<void>;
}

export default function AuthenticatedPromptbar({
  onProtectedAction,
}: AuthenticatedPromptbarProps) {
  const { data: session } = useSession();
  const { hasApiKey, isLoading, error, validateAndSaveApiKey, preferredModel } =
    useApiKey();

  return (
    <Promptbar
      isAuthenticated={!!session?.user}
      onSignIn={function () {
        signIn();
      }}
      onProtectedAction={onProtectedAction}
      hasApiKey={hasApiKey}
      isApiKeyLoading={isLoading}
      apiKeyError={error}
      preferredModel={preferredModel || undefined}
      selectedModelId={preferredModel || undefined}
      onSaveApiKey={validateAndSaveApiKey}
    />
  );
}
