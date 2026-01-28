"use client"

import React, { Suspense, useState, useEffect, memo } from "react"
import dynamic from "next/dynamic"
import { motion } from "motion/react"
import type { GradientT } from "@shadergradient/react"
import { useTabVisibility } from "../../hooks/useTabVisibility"
import { useInView } from "../../hooks/useInView"

const COLORS = {
  color1: "#73bfc4",
  color2: "#ff810a",
  color3: "#8da0ce",
} as const

const GRADIENT_CONFIG: GradientT = {
  control: "props",
  animate: "on",
  type: "sphere",
  ...COLORS,
  brightness: 0.8,
  cAzimuthAngle: 270,
  cDistance: 0.5,
  cPolarAngle: 180,
  cameraZoom: 15.1,
  envPreset: "city",
  grain: "on",
  lightType: "env",
  positionX: -0.1,
  positionY: 0,
  positionZ: 0,
  reflection: 0.4,
  rotationX: 0,
  rotationY: 130,
  rotationZ: 70,
  shader: "defaults",
  uAmplitude: 3.2,
  uDensity: 0.8,
  uFrequency: 5.5,
  uSpeed: 0.3,
  uStrength: 0.3,
}

const CANVAS_STYLE = {
  width: "100%",
  height: "100%",
  pointerEvents: "none",
} as const

const ShaderGradientCanvas = dynamic(
  () => import("@shadergradient/react").then((mod) => mod.ShaderGradientCanvas),
  { ssr: false }
)

const ShaderGradient = dynamic(
  () => import("@shadergradient/react").then((mod) => mod.ShaderGradient),
  { ssr: false }
)

const FALLBACK_GRADIENT_STYLE = {
  background: `
    radial-gradient(circle at 75% 25%, ${COLORS.color1}44 0%, transparent 60%),
    radial-gradient(circle at 25% 75%, ${COLORS.color2}44 0%, transparent 60%),
    radial-gradient(circle at 50% 50%, ${COLORS.color3}33 0%, transparent 70%)
  `,
  filter: "blur(140px)",
} as const

const StaticGradientFallback = memo(function StaticGradientFallback({ opacity }: { opacity: number }) {
  return (
    <motion.div 
      className="absolute inset-0 z-0"
      initial={{ opacity: 0.4 }}
      animate={{ opacity }}
      transition={{ duration: 1.5, ease: "easeInOut" }}
      style={FALLBACK_GRADIENT_STYLE}
    />
  )
})

const ShaderContent = memo(function ShaderContent({ 
  shouldRender, 
  hasAppeared 
}: { 
  shouldRender: boolean
  hasAppeared: boolean 
}) {
  if (!shouldRender) return null
  
  return (
    <Suspense fallback={null}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: hasAppeared ? 1 : 0 }}
        transition={{ duration: 2.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full h-full"
      >
        <ShaderGradientCanvas
          pixelDensity={1} 
          fov={45}
          style={CANVAS_STYLE}
          powerPreference="low-power"
        >
          <ShaderGradient {...GRADIENT_CONFIG} />
        </ShaderGradientCanvas>
      </motion.div>
    </Suspense>
  )
})

export function ShaderGradientBackground() {
  const [hasAppeared, setHasAppeared] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const isDocumentVisible = useTabVisibility()
  const { ref: containerRef, isInView: isInViewport } = useInView({ threshold: 0.1 })
  
  const shouldRenderShader = isMounted && isDocumentVisible && isInViewport

  useEffect(() => {
    const mountTimer = setTimeout(() => setIsMounted(true), 100)
    return () => clearTimeout(mountTimer)
  }, [])

  useEffect(() => {
    if (!isMounted) return
    const timer = setTimeout(() => setHasAppeared(true), 150)
    return () => clearTimeout(timer)
  }, [isMounted])

  const fallbackOpacity = hasAppeared ? 0.15 : 0.4

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 w-full h-full -z-50 overflow-hidden bg-background select-none pointer-events-none"
      aria-hidden="true"
    >
      <StaticGradientFallback opacity={shouldRenderShader ? fallbackOpacity : 0.25} />
      <div className="absolute inset-0 z-5">
        <ShaderContent shouldRender={shouldRenderShader} hasAppeared={hasAppeared} />
      </div>
    </div>
  )
}