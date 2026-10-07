"use client"

import AuthenticatedPromptbar from "@/components/authenticatedPromptbar"
import { useSession } from "@/lib/auth-client";
import { FlipWords } from "@edward/ui/components/ui/flipWords";
import { cn } from "@edward/ui/lib/utils";
import { SITE_DESCRIPTION } from "@/lib/site";

export function Hero() {
  const { data: session } = useSession();
  const words = ["better", "modern", "minimalist", "awesome", "simple"];
  const isAuth = !!session?.user;

  return (
    <div
      className={cn(
        "relative z-10 flex flex-col items-center justify-center px-4 pt-16 sm:pt-20 md:pt-0",
        isAuth
          ? "min-h-[60vh] pb-10 md:min-h-[80vh] md:pb-20"
          : "min-h-[80vh] pb-20",
      )}
    >
      <div className="flex w-full max-w-3xl flex-col items-center">
        <h1 className="mb-5 text-center font-bold leading-[1.1] tracking-tight text-foreground text-3xl md:text-5xl lg:text-6xl select-none">
          Ask{" "}
          {isAuth ? (
            <span className="bg-gradient-to-r from-sky-400 to-indigo-500 bg-clip-text text-transparent">
              Edward
            </span>
          ) : (
            "Edward"
          )}{" "}
          to ship{" "}
          <FlipWords
            className={isAuth ? "italic font-normal" : "italic"}
            words={words}
          />{" "}
          web apps.
        </h1>

        <p className="mb-12 text-center text-base leading-normal text-muted-foreground md:text-lg lg:text-xl max-w-xl">
          {SITE_DESCRIPTION}
        </p>

        <div className="w-full mt-2">
          <AuthenticatedPromptbar />
        </div>
      </div>
    </div>
  );
}
