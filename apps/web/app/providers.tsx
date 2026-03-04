"use client";

import { useState, type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domAnimation, useReducedMotion } from "motion/react";
import { ChatStreamProvider } from "@/contexts/chatStreamContext";
import { SandboxEffects } from "@/components/sandbox/SandboxEffects";
import { Toaster } from "@edward/ui/components/sonner";
import { useNotificationManager } from "@/hooks/useNotificationManager";
import { useSession } from "@/lib/auth-client";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const { data: session, isPending } = useSession();
  const prefersReducedMotion = useReducedMotion();
  useNotificationManager();
  const forcedTheme = !isPending && !session?.user ? "dark" : undefined;

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      forcedTheme={forcedTheme}
      enableSystem
      disableTransitionOnChange
      enableColorScheme
    >
      <LazyMotion features={domAnimation}>
        <MotionConfig
          reducedMotion="user"
          transition={prefersReducedMotion ? { duration: 0 } : undefined}
        >
          <QueryClientProvider client={queryClient}>
            <ChatStreamProvider>
              <SandboxEffects>
                {children}
                <Toaster />
              </SandboxEffects>
            </ChatStreamProvider>
          </QueryClientProvider>
        </MotionConfig>
      </LazyMotion>
    </NextThemesProvider>
  );
}
