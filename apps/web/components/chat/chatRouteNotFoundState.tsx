"use client";

import Link from "next/link";
import { ArrowLeft, Link2Off, MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { useSession, signIn } from "@/lib/auth-client";
import { Button } from "@edward/ui/components/button";
import { EdwardLogo } from "@edward/ui/components/brand/edwardLogo";
import { LoginModal } from "@edward/ui/components/ui/loginModal";
import { GitHub } from "@edward/ui/components/icons/github";

type ChatRouteNotFoundVariant = "invalid_id" | "missing_or_forbidden";

interface ChatRouteNotFoundStateProps {
  variant: ChatRouteNotFoundVariant;
}

const COPY: Record<
  ChatRouteNotFoundVariant,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  invalid_id: {
    eyebrow: "Invalid URL",
    title: "Invalid conversation link",
    description:
      "This URL does not match Edward's conversation ID format. Check the link or open a conversation from Recent Projects.",
  },
  missing_or_forbidden: {
    eyebrow: "Edward Workspace",
    title: "Conversation not found",
    description:
      "This conversation may have been deleted or you may not have access anymore.",
  },
};

export function ChatRouteNotFoundState({
  variant,
}: ChatRouteNotFoundStateProps) {
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const content = COPY[variant];

  return (
    <main className="relative flex min-h-[calc(100dvh-4rem)] w-full max-w-full flex-col items-center justify-center overflow-hidden px-4">
      <div className="absolute top-1/2 left-1/2 -z-10 h-[min(32rem,90vw)] w-[min(32rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-sky-500/5 to-indigo-500/5 blur-3xl" />

      <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <div className="relative mb-6 h-16 w-16">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/25 to-indigo-500/25 blur-md opacity-40" />
          <EdwardLogo
            size={64}
            priority
            quality={78}
            sizes="64px"
            className="relative h-16 w-16 rounded-2xl shadow-2xl shadow-sky-500/15"
          />
        </div>

        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/60">
          {content.eyebrow}
        </p>
        <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {content.title}
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground/70">
          {content.description}
        </p>

        <div className="mt-7 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
          {isAuthenticated ? (
            <>
              <Button asChild size="sm" className="h-9 w-full px-4 sm:w-auto">
                <Link href="/">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Go Home
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="h-9 w-full px-4 text-muted-foreground hover:text-foreground sm:w-auto"
              >
                <Link href="/#recent-projects">
                  {variant === "invalid_id" ? (
                    <Link2Off className="h-3.5 w-3.5" />
                  ) : (
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                  )}
                  Recent Projects
                </Link>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-9 w-full px-4 sm:w-auto"
              onClick={() => setShowLoginModal(true)}
            >
              <GitHub className="h-3.5 w-3.5" />
              Login with GitHub
            </Button>
          )}
        </div>
      </div>
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSignIn={signIn}
      />
    </main>
  );
}
