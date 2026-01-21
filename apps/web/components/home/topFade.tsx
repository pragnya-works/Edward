"use client"

import { motion, useScroll, useTransform } from "motion/react"

export function TopFade() {
  const { scrollY } = useScroll()
  const opacity = useTransform(scrollY, [0, 300], [0, 1])

  return (
    <motion.div
      style={{ opacity }}
      className="pointer-events-none fixed left-0 right-0 top-0 z-[15] h-32 bg-gradient-to-b from-white/70 to-transparent dark:from-black/70"
    />
  )
}
