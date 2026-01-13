import { ShaderGradientBackground } from "@/components/home/shaderGradient"
import { Hero } from "@/components/home/hero"
import Navbar from "../navbar"

export default function Home() {
  return (
    <div>
      <Navbar />
      <ShaderGradientBackground />
      <Hero />
    </div>
  )
}
