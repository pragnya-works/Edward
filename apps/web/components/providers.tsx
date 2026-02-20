"use client";

import { useState, type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { ChatStreamProvider } from "@/contexts/chatStreamContext";
import { SandboxProvider } from "@/contexts/sandboxContext";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      enableColorScheme
    >
      <LazyMotion features={domAnimation}>
        <MotionConfig reducedMotion="user">
          <QueryClientProvider client={queryClient}>
            <ChatStreamProvider>
              <SandboxProvider>{children}</SandboxProvider>
            </ChatStreamProvider>
          </QueryClientProvider>
        </MotionConfig>
      </LazyMotion>
    </NextThemesProvider>
  );
}
