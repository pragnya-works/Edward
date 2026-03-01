"use client"

import React, { Suspense, useState, useEffect, useCallback, useRef, memo } from "react"
import dynamic from "next/dynamic"
import { m } from "motion/react"
import type { GradientT } from "@shadergradient/react"
import type { RootState } from "@react-three/fiber"
import { useTabVisibility } from "@edward/ui/hooks/useTabVisibility"
import { useInView } from "@edward/ui/hooks/useInView"

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

type ShaderCanvasProps = {
  pixelDensity?: number
  fov?: number
  style?: React.CSSProperties
  powerPreference?: "default" | "high-performance" | "low-power"
  onCreated?: (state: RootState) => void
  children?: React.ReactNode
}

const ShaderGradientCanvas = dynamic<ShaderCanvasProps>(
  () =>
    import("@shadergradient/react").then(
      (mod) => mod.ShaderGradientCanvas as React.ComponentType<ShaderCanvasProps>
    ),
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
    <m.div 
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
  isReady,
  onReady,
}: { 
  shouldRender: boolean
  isReady: boolean
  onReady: () => void
}) {
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  if (!shouldRender) return null
  
  return (
    <Suspense fallback={null}>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isReady ? 1 : 0 }}
        transition={{ duration: 2.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full h-full [&_canvas]:!bg-transparent"
      >
        <ShaderGradientCanvas
          pixelDensity={1} 
          fov={45}
          style={CANVAS_STYLE}
          powerPreference="low-power"
          onCreated={({ gl }: RootState) => {
            gl.setClearColor(0x000000, 0)
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (mountedRef.current) onReady()
              })
            })
          }}
        >
          <ShaderGradient {...GRADIENT_CONFIG} />
        </ShaderGradientCanvas>
      </m.div>
    </Suspense>
  )
})

const CONTAINER_BG = "oklch(0.145 0 0)"

export function ShaderGradientBackground() {
  const [isShaderReady, setIsShaderReady] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const isDocumentVisible = useTabVisibility()
  const { ref: containerRef, isInView: isInViewport } = useInView({ threshold: 0.1 })
  const readyFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const shouldRenderShader = isMounted && isDocumentVisible && isInViewport

  const handleShaderReady = useCallback(() => {
    setIsShaderReady(true)
    if (readyFallbackRef.current !== null) {
      clearTimeout(readyFallbackRef.current)
      readyFallbackRef.current = null
    }
  }, [])

  useEffect(() => {
    const mountTimer = setTimeout(() => setIsMounted(true), 100)
    return () => clearTimeout(mountTimer)
  }, [])

  useEffect(() => {
    if (isShaderReady || !shouldRenderShader) return

    readyFallbackRef.current = setTimeout(() => {
      readyFallbackRef.current = null
      setIsShaderReady(true)
    }, 3000)

    return () => {
      if (readyFallbackRef.current !== null) {
        clearTimeout(readyFallbackRef.current)
        readyFallbackRef.current = null
      }
    }
  }, [isShaderReady, shouldRenderShader])

  const fallbackOpacity = isShaderReady ? 0.15 : 0.4

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 opacity-75 w-full h-full -z-50 overflow-hidden select-none pointer-events-none"
      style={{ backgroundColor: CONTAINER_BG }}
      aria-hidden="true"
    >
      <StaticGradientFallback opacity={shouldRenderShader ? fallbackOpacity : 0.25} />
      <div className="absolute inset-0 z-5">
        <ShaderContent shouldRender={shouldRenderShader} isReady={isShaderReady} onReady={handleShaderReady} />
      </div>
    </div>
  )
}
