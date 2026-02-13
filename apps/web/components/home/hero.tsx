"use client"

import AuthenticatedPromptbar from "@/components/authenticatedPromptbar"
import { FlipWords } from "@edward/ui/components/ui/flipWords";
import { useSession } from "@/lib/auth-client";

export function Hero() {
  const { data: session } = useSession();
  const words = ["better", "modern", "minimalist", "awesome", "simple"];
  const isAuth = !!session?.user;

  return (
    <div className="relative z-10 flex min-h-[80vh] flex-col items-center justify-center px-4 pb-20">
      {isAuth && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-sky-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />
      )}

      <div className="flex w-full max-w-3xl flex-col items-center">
        <h1 className="mb-5 text-center font-bold leading-[1.1] tracking-tight text-foreground text-3xl md:text-5xl lg:text-6xl select-none">
          Ask {isAuth ? (
            <span className="bg-gradient-to-r from-sky-400 to-indigo-500 bg-clip-text text-transparent">Edward</span>
          ) : (
            "Edward"
          )} to ship <br />
          <FlipWords className={isAuth ? "italic font-normal" : "italic"} words={words} />
          web apps.
        </h1>
        <p className="mb-12 text-center text-base leading-normal text-muted-foreground md:text-lg lg:text-xl max-w-xl">
          Orchestrate complex web systems and stunning interfaces through high-fidelity conversational engineering.
        </p>
        <div className={isAuth ? "w-full relative group" : "w-full"}>
          {isAuth && (
            <div className="absolute -inset-1 bg-gradient-to-r from-sky-500/10 to-indigo-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
          )}
          <AuthenticatedPromptbar />
        </div>
      </div>
    </div>
  );
}

