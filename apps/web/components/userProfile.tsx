"use client";

import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { useSession } from "@/lib/auth-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@edward/ui/components/avatar";
import { Button } from "@edward/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuPositioner,
} from "@edward/ui/components/ui/dropdown-menu";
import { LogOut, Key } from "lucide-react";
import { useRouter } from "next/navigation";
import { BYOK } from "@edward/ui/components/ui/byok";
import { useApiKey } from "@/hooks/useApiKey";
import { getBestGuessProvider } from "@edward/shared/schema";
import {
  AnimatedThemeToggler,
  type AnimatedThemeTogglerHandle,
} from "@edward/ui/components/animated-theme-toggler";
import { useRef } from "react";
import { useSidebar } from "@edward/ui/components/sidebar";
import { cn } from "@edward/ui/lib/utils";

export default function UserProfile() {
  const router = useRouter();
  const { data: session } = useSession();
  const {
    keyPreview,
    hasApiKey,
    validateAndSaveApiKey,
    preferredModel,
    error,
  } = useApiKey();
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const themeTogglerRef = useRef<AnimatedThemeTogglerHandle>(null);
  const { open } = useSidebar();

  if (!session?.user) {
    return null;
  }

  const user = session.user;

  async function handleSignOut() {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className={cn(
                "relative group/sidebar",
                open
                  ? "flex items-center justify-start gap-2 py-2 w-full h-auto px-0"
                  : "mx-auto h-12 w-12 flex items-center justify-center px-0 !bg-transparent hover:!bg-transparent dark:hover:!bg-transparent active:!bg-transparent",
              )}
            >
              <Avatar className={cn("shrink-0", open ? "h-8 w-8" : "h-10 w-10")}>
                <AvatarImage
                  src={user.image || ""}
                  alt={user.name || "User profile"}
                />
                <AvatarFallback>
                  {user.name?.charAt(0)?.toUpperCase() ||
                    user.email?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  "text-neutral-700 dark:text-neutral-200 text-sm whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform] duration-200",
                  open
                    ? "max-w-50 opacity-100 translate-x-0 group-hover/sidebar:translate-x-1"
                    : "max-w-0 opacity-0 -translate-x-1",
                )}
              >
                {user.name || "User"}
              </span>
            </Button>
          }
        ></DropdownMenuTrigger>
        <DropdownMenuPositioner side="top" align="start" sideOffset={10}>
          <DropdownMenuContent className="w-56 rounded-xl bg-card/50 backdrop-blur-md">
            <div className="flex flex-col space-y-1.5 p-2">
              <p className="text-sm font-medium">{user.name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate max-w-37.5">
                {user.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsApiKeyModalOpen(true)}>
              <Key className="mr-2 h-4 w-4" />
              <span>Manage API Keys</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                themeTogglerRef.current?.toggleTheme();
              }}
            >
              <AnimatedThemeToggler ref={themeTogglerRef} />
              <span className="ml-2">Change theme</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPositioner>
      </DropdownMenu>

      <BYOK
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onValidate={() => {}}
        onSaveApiKey={validateAndSaveApiKey}
        keyPreview={keyPreview}
        hasExistingKey={hasApiKey ?? false}
        preferredModel={preferredModel || undefined}
        initialProvider={getBestGuessProvider(preferredModel, keyPreview)}
        error={error}
      />
    </>
  );
}
