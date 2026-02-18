"use client";

import { m } from "motion/react";

interface BeamProps {
  x: string;
  delay: number;
  duration: number;
  width?: string;
}

function Beam({ x, delay, duration, width = "1px" }: BeamProps) {
  return (
    <m.div
      initial={{ y: "-20%", opacity: 0 }}
      animate={{ 
        y: "120%", 
        opacity: [0, 0, 0.15, 0.15, 0] 
      }}
      transition={{
        duration,
        repeat: Infinity,
        delay,
        ease: "linear",
      }}
      className="absolute top-0 h-[40%] bg-gradient-to-b from-transparent via-white/10 to-transparent sm:via-white/20"
      style={{ left: x, width }}
    />
  );
}

export function BlueprintBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-[-10] overflow-hidden select-none" aria-hidden="true">
      <div 
        className="absolute inset-0 opacity-[0.15]" 
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px'
        }}
      />

      <div 
        className="absolute inset-0 opacity-[0.3]" 
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)`,
          backgroundSize: '20px 20px'
        }}
      />
      
      <div 
        className="absolute inset-0 opacity-[0.02] mix-blend-normal pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div 
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 50%, transparent 0%, rgba(0,0,0,0.4) 100%)"
        }}
      />

      <div className="absolute inset-0 overflow-hidden">
        <Beam x="10%" delay={0} duration={12} />
        <Beam x="30%" delay={4} duration={15} />
        <Beam x="65%" delay={2} duration={18} />
        <Beam x="85%" delay={7} duration={14} />
      </div>
    </div>
  );
}
