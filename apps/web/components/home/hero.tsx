"use client"

import AuthenticatedPromptbar from "@/components/authenticatedPromptbar"
import { FlipWords } from "@workspace/ui/components/ui/flipWords";

export function Hero() {
  const words = ["better", "modern", "minimalist", "awesome", "simple"]
  return (
    <div className="relative z-10 flex min-h-[70vh] flex-col items-center justify-center px-4">
      <div className="flex w-full max-w-3xl flex-col items-center">
        <h1 className="mb-5 text-center font-bold leading-[1.1] tracking-tight text-white text-4xl lg:text-6xl">
          Ask Edward to ship <br/>
            <FlipWords className="italic" words={words} />
          web apps.
        </h1>
        <p className="mb-12 text-center text-lg leading-normal text-gray-200 md:text-xl">
          Create stunning apps & websites by chatting with Edward.
        </p>
        <AuthenticatedPromptbar />
      </div>
    </div>
  )
}
