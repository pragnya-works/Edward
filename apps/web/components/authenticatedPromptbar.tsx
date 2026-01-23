"use client";

import Promptbar from "@workspace/ui/components/ui/promptbar";
import { useSession, signIn } from "@/lib/auth-client";
import { useApiKey } from "@/hooks/useApiKey";

interface AuthenticatedPromptbarProps {
  onProtectedAction?: () => void | Promise<void>;
}

export default function AuthenticatedPromptbar({
  onProtectedAction,
}: AuthenticatedPromptbarProps) {
  const { data: session } = useSession();
  const { hasApiKey, isLoading, error, validateAndSaveApiKey } = useApiKey();

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
      onSaveApiKey={validateAndSaveApiKey}
    />
  );
}