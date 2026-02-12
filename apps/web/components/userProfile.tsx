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
import { Provider } from "@edward/shared/constants";
import { getBestGuessProvider } from "@edward/shared/schema";
import {
  AnimatedThemeToggler,
  type AnimatedThemeTogglerHandle,
} from "@edward/ui/components/animated-theme-toggler";
import { useRef } from "react";
import { useSidebar } from "@edward/ui/components/sidebar";
import { motion } from "motion/react";

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
  const { open, animate } = useSidebar();

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
              className="relative flex items-center justify-start gap-2 group/sidebar py-2 w-full h-auto px-0 hover:bg-transparent"
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage
                  src={user.image || ""}
                  alt={user.name || "User profile"}
                />
                <AvatarFallback>
                  {user.name?.charAt(0)?.toUpperCase() ||
                    user.email?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <motion.span
                animate={{
                  display: animate
                    ? open
                      ? "inline-block"
                      : "none"
                    : "inline-block",
                  opacity: animate ? (open ? 1 : 0) : 1,
                }}
                className="text-neutral-700 dark:text-neutral-200 text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block p-0! m-0!"
              >
                {user.name || "User"}
              </motion.span>
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
