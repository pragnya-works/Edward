"use client";

import Link from "next/link";
import { ArrowLeft, FileWarning } from "lucide-react";
import { useState } from "react";
import { useSession, signIn } from "@/lib/auth-client";
import { Button } from "@edward/ui/components/button";
import { EdwardLogo } from "@edward/ui/components/brand/edwardLogo";
import { LoginModal } from "@edward/ui/components/ui/loginModal";
import { GitHub } from "@edward/ui/components/icons/github";

export default function NotFound() {
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user);
  const [showLoginModal, setShowLoginModal] = useState(false);

  return (
    <main className="relative flex min-h-[calc(100dvh-4rem)] w-full max-w-full items-center justify-center overflow-hidden px-4 sm:px-6">
      <div className="absolute top-1/2 left-1/2 -z-10 h-[min(32rem,90vw)] w-[min(32rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-sky-500/5 to-indigo-500/5 blur-3xl" />
      <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-[0_20px_80px_-45px_rgba(2,132,199,0.45)] backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/80 to-background/65" />
        <div className="relative px-6 py-8 sm:px-10">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-background/90">
              <EdwardLogo
                size={34}
                priority
                quality={80}
                sizes="34px"
                className="rounded-lg"
              />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
              Edward Changelog
            </p>
          </div>

          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <FileWarning className="h-3.5 w-3.5" />
            Missing resource
          </div>

          <h2 className="mb-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Changelog page not found
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            The changelog item you requested is unavailable right now. It may have moved or been
            removed during a sync.
          </p>

          <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {isAuthenticated ? (
              <Button asChild size="lg" className="h-11 w-full px-5 sm:w-auto">
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                  Go Home
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                className="h-11 w-full px-5 sm:w-auto"
                onClick={() => setShowLoginModal(true)}
              >
                <GitHub className="h-4 w-4" />
                Login with GitHub
              </Button>
            )}
          </div>
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
