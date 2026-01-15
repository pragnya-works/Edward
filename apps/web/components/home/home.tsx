"use client"

import { ShaderGradientBackground } from "@/components/home/shaderGradient"
import { Hero } from "@/components/home/hero"
import Navbar from "../navbar"
import { useSession } from "@/lib/auth-client"

export default function Home() {

  const { data: session } = useSession()

  return (
    <div>
      <Navbar />
      {!session?.user ? <ShaderGradientBackground /> : null}
      <Hero />
    </div>
  )
}
