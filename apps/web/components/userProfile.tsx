"use client";

import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { useSession } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu";
import { LogOut, Key } from "lucide-react";
import { useRouter } from "next/navigation";
import { BYOK } from "@workspace/ui/components/ui/byok";
import { useApiKey } from "@/hooks/useApiKey";
import { Provider, API_KEY_REGEX } from "@workspace/ui/constants/apiKey.constants";

export default function UserProfile() {
  const router = useRouter();
  const { data: session } = useSession();
  const { apiKey, validateAndSaveApiKey, error } = useApiKey();
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  if (!session?.user) {
    return null;
  }

  const user = session.user;

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  const getProviderFromKey = (key: string): Provider => {
    if (API_KEY_REGEX[Provider.OPENAI].test(key)) return Provider.OPENAI;
    if (API_KEY_REGEX[Provider.GEMINI].test(key)) return Provider.GEMINI;
    return Provider.OPENAI;
  };

  const initialProvider = apiKey ? getProviderFromKey(apiKey) : Provider.OPENAI;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.image || ""} alt={user.name || "User profile"} />
              <AvatarFallback>
                {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <div className="flex flex-col space-y-1.5 p-2">
            <p className="text-sm font-medium">{user.name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[150px]">{user.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIsApiKeyModalOpen(true)}>
            <Key className="mr-2 h-4 w-4" />
            <span>Manage API Keys</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BYOK
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onValidate={() => {}}
        onSaveApiKey={validateAndSaveApiKey}
        initialApiKey={apiKey || ""}
        initialProvider={initialProvider}
        error={error}
      />
    </>
  );
}