"use client";

import Promptbar from "@workspace/ui/components/ui/promptbar";
import { useSession, signIn } from "@/lib/auth-client";

interface AuthenticatedPromptbarProps {
  onProtectedAction?: () => void | Promise<void>;
}

export default function AuthenticatedPromptbar({ onProtectedAction }: AuthenticatedPromptbarProps) {
  const { data: session } = useSession();

  return (
    <Promptbar
      isAuthenticated={!!session?.user}
      onSignIn={async () => {
        try {
          await signIn();
        } catch (error) {
          console.error("Sign in failed:", error);
        }
      }}
      onProtectedAction={onProtectedAction}
    />
  );
}