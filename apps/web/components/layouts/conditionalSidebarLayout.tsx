"use client";

import { useSession } from "@/lib/auth-client";
import { AppSidebar } from "@edward/ui/components/ui/appSidebar";
import { SidebarProvider } from "@edward/ui/components/sidebar";
import { cn } from "@edward/ui/lib/utils";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import UserProfile from "../userProfile";
import { usePathname } from "next/navigation";
import { useRecentChats } from "@/hooks/server-state/useRecentChats";
import { EdwardLogoLoader } from "@/components/chat/edwardLogoLoader";
import { useMinimumLoadingDuration } from "@/hooks/useMinimumLoadingDuration";
import { useFadeOverlay } from "@/hooks/useFadeOverlay";
import { BYOK } from "@edward/ui/components/ui/byok";
import { useApiKey } from "@/hooks/server-state/useApiKey";
import { getBestGuessProvider } from "@edward/shared/schema";
import { useMobileViewport } from "@edward/ui/hooks/useMobileViewport";

const FADE_DURATION_MS = 500;
const MOBILE_SIDEBAR_CLOSE_MS = 320;

interface ConditionalSidebarLayoutProps {
  children: ReactNode;
}

export default function ConditionalSidebarLayout({
  children,
}: ConditionalSidebarLayoutProps) {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const openApiKeyTimeoutRef = useRef<number | null>(null);
  const isMobile = useMobileViewport();
  const {
    keyPreview,
    hasApiKey,
    validateAndSaveApiKey,
    preferredModel,
    error,
    isRateLimited,
    rateLimitMessage,
  } = useApiKey();
  const pathname = usePathname();
  const isChatConversationRoute = pathname.startsWith("/chat/");
  const shouldShowSessionLoader = useMinimumLoadingDuration(
    isPending && !isChatConversationRoute,
    2500,
  );

  const { visible: overlayVisible, isFadingOut } = useFadeOverlay(
    shouldShowSessionLoader,
    FADE_DURATION_MS,
  );

  const {
    projects: recentChats,
    total: recentChatsTotal,
    isLoading: isRecentChatsLoading,
  } = useRecentChats();

  useEffect(() => {
    return () => {
      if (openApiKeyTimeoutRef.current !== null) {
        window.clearTimeout(openApiKeyTimeoutRef.current);
      }
    };
  }, []);

  const handleManageApiKeys = useCallback(() => {
    if (openApiKeyTimeoutRef.current !== null) {
      window.clearTimeout(openApiKeyTimeoutRef.current);
    }

    if (isMobile && open) {
      setOpen(false);
      openApiKeyTimeoutRef.current = window.setTimeout(() => {
        setIsApiKeyModalOpen(true);
        openApiKeyTimeoutRef.current = null;
      }, MOBILE_SIDEBAR_CLOSE_MS);
      return;
    }

    setIsApiKeyModalOpen(true);
  }, [isMobile, open]);

  const content = session?.user ? (
    <SidebarProvider open={open} setOpen={setOpen} animate={true}>
      <div
        className={cn(
          "rounded-md flex flex-col md:flex-row bg-gray-100 dark:bg-neutral-800 w-full flex-1 mx-auto border border-neutral-200 dark:border-neutral-700 overflow-hidden",
          "h-[100dvh] sm:h-screen",
        )}
      >
        <AppSidebar
          open={open}
          setOpen={setOpen}
          recentChats={recentChats}
          recentChatsTotal={recentChatsTotal}
          isRecentChatsLoading={isRecentChatsLoading}
          recentProjectsHref="/?section=recent-projects"
        >
          <UserProfile onManageApiKeys={handleManageApiKeys} />
        </AppSidebar>
        <div className="flex flex-1 min-h-0 min-w-0">
          <div className="p-1.5 sm:p-0 rounded-tl-xl sm:rounded-tl-2xl border border-neutral-200 dark:border-neutral-700 md:border-l-0 bg-white dark:bg-neutral-900 flex flex-col gap-1.5 sm:gap-2 flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </div>
      </div>

      <BYOK
        controller={{
          modal: {
            isOpen: isApiKeyModalOpen,
            onClose: () => setIsApiKeyModalOpen(false),
          },
          actions: {
            onValidate: () => {},
            onSaveApiKey: validateAndSaveApiKey,
          },
          state: {
            keyPreview,
            hasExistingKey: hasApiKey ?? false,
            preferredModel: preferredModel || undefined,
            initialProvider: getBestGuessProvider(preferredModel, keyPreview),
            error,
            isRateLimited,
            rateLimitMessage,
          },
        }}
      />
    </SidebarProvider>
  ) : (
    <div className="min-h-[100dvh] sm:min-h-screen dark text-foreground">
      {children}
    </div>
  );

  return (
    <>
      {!shouldShowSessionLoader ? content : null}
      {overlayVisible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(0.145_0_0)]"
          style={{
            opacity: isFadingOut ? 0 : 1,
            transition: `opacity ${FADE_DURATION_MS}ms ease-in-out`,
            pointerEvents: isFadingOut ? "none" : "auto",
          }}
          aria-hidden={isFadingOut}
        >
          <EdwardLogoLoader
            className="w-[240px] md:w-[320px] aspect-square text-white"
            withBackground
          />
        </div>
      )}
    </>
  );
}
