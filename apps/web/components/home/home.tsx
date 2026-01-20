"use client"

import { ShaderGradientBackground } from "@/components/home/shaderGradient"
import { Hero } from "@/components/home/hero"
import { TopFade } from "@/components/home/topFade"
import { useSession } from "@/lib/auth-client"

export default function Home() {

  const { data: session } = useSession()

  return (
    <div>
      <TopFade />
      {!session?.user ? <ShaderGradientBackground /> : null}
      <Hero />
    </div>
  )
}
