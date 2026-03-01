"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { m, AnimatePresence } from "motion/react";
import { cn } from "@edward/ui/lib/utils";
import { Cpu } from "lucide-react";

const GENERATING_EXAMPLES = [
    {
        code: [
            "import { NextResponse } from 'next/server';",
            "import { db } from '@/lib/db';",
            "",
            "export async function POST(req: Request) {",
            "  try {",
            "    const body = await req.json();",
            "    const { title, content } = body;",
            "",
            "    if (!title || !content) {",
            "      return new NextResponse('Missing Data', { status: 400 });",
            "    }",
            "",
            "    const post = await db.post.create({",
            "      data: {",
            "        title,",
            "        content,",
            "        published: true,",
            "      }",
            "    });",
            "",
            "    return NextResponse.json(post);",
            "  } catch (error) {",
            "    return new NextResponse('Internal Error', { status: 500 });",
            "  }",
            "}"
        ],
        accent: "text-blue-500 dark:text-blue-400"
    },
    {
        code: [
            "import { useState, useEffect } from 'react';",
            "import { motion } from 'framer-motion';",
            "import { MetricsGrid } from './metrics-grid';",
            "",
            "export const Dashboard = () => {",
            "  const [stats, setStats] = useState(null);",
            "  const [isLoading, setIsLoading] = useState(true);",
            "",
            "  useEffect(() => {",
            "    async function fetchStats() {",
            "      const res = await fetch('/api/stats');",
            "      if (!res.ok) throw new Error('Failed to fetch');",
            "      const data = await res.json();",
            "      setStats(data);",
            "      setIsLoading(false);",
            "    }",
            "    fetchStats();",
            "  }, []);",
            "",
            "  if (isLoading) return <Loader />;",
            "",
            "  return (",
            "    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>",
            "      <h1 className=\"text-2xl font-bold mb-6\">Overview</h1>",
            "      <MetricsGrid stats={stats} />",
            "    </motion.div>",
            "  );",
            "}"
        ],
        accent: "text-purple-500 dark:text-purple-400"
    },
    {
        code: [
            "/** @type {import('tailwindcss').Config} */",
            "module.exports = {",
            "  darkMode: ['class'],",
            "  content: [",
            "    './app/**/*.{ts,tsx}',",
            "    './components/**/*.{ts,tsx}',",
            "    './lib/**/*.{ts,tsx}',",
            "  ],",
            "  theme: {",
            "    extend: {",
            "      colors: {",
            "        border: 'hsl(var(--border))',",
            "        input: 'hsl(var(--input))',",
            "        ring: 'hsl(var(--ring))',",
            "        background: 'hsl(var(--background))',",
            "        foreground: 'hsl(var(--foreground))',",
            "        primary: {",
            "          DEFAULT: 'hsl(var(--primary))',",
            "          foreground: 'hsl(var(--primary-foreground))',",
            "        },",
            "      },",
            "      borderRadius: {",
            "        lg: 'var(--radius)',",
            "        md: 'calc(var(--radius) - 2px)',",
            "        sm: 'calc(var(--radius) - 4px)',",
            "      },",
            "    }",
            "  },",
            "  plugins: [require('tailwindcss-animate')],",
            "}"
        ],
        accent: "text-emerald-500 dark:text-emerald-400"
    },
    {
        code: [
            "import { create } from 'zustand';",
            "import { persist } from 'zustand/middleware';",
            "",
            "interface AppState {",
            "  theme: 'light' | 'dark';",
            "  sidebarOpen: boolean;",
            "  toggleTheme: () => void;",
            "  setSidebarOpen: (open: boolean) => void;",
            "}",
            "",
            "export const useAppStore = create<AppState>()(",
            "  persist(",
            "    (set) => ({",
            "      theme: 'dark',",
            "      sidebarOpen: true,",
            "      toggleTheme: () => set((state) => ({ ",
            "        theme: state.theme === 'light' ? 'dark' : 'light' ",
            "      })),",
            "      setSidebarOpen: (open) => set({ sidebarOpen: open }),",
            "    }),",
            "    { name: 'app-storage' }",
            "  )",
            ");"
        ],
        accent: "text-orange-500 dark:text-orange-400"
    },
    {
        code: [
            "generator client {",
            "  provider = \"prisma-client-js\"",
            "}",
            "",
            "datasource db {",
            "  provider = \"postgresql\"",
            "  url      = env(\"DATABASE_URL\")",
            "}",
            "",
            "model User {",
            "  id        String   @id @default(cuid())",
            "  name      String?",
            "  email     String?  @unique",
            "  image     String?",
            "  createdAt DateTime @default(now())",
            "  updatedAt DateTime @updatedAt",
            "  posts     Post[]",
            "}",
            "",
            "model Post {",
            "  id        String   @id @default(cuid())",
            "  title     String",
            "  published Boolean  @default(false)",
            "  authorId  String",
            "  author    User     @relation(fields: [authorId], references: [id])",
            "  createdAt DateTime @default(now())",
            "}"
        ],
        accent: "text-teal-500 dark:text-teal-400"
    }
];

export const GeneratingAnimation = memo(function GeneratingAnimation() {
    const [index, setIndex] = useState(0);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        setIndex(Math.floor(Math.random() * GENERATING_EXAMPLES.length));
    }, []);

    useEffect(() => {
        if (!isMounted) return;
        const interval = setInterval(() => {
            setIndex((prev) => {
                const offset = 1 + Math.floor(Math.random() * (GENERATING_EXAMPLES.length - 1));
                return (prev + offset) % GENERATING_EXAMPLES.length;
            });
        }, 7500);
        return () => clearInterval(interval);
    }, [isMounted]);

    const current = GENERATING_EXAMPLES[index] || GENERATING_EXAMPLES[0];

    const keyedCodeLines = useMemo(() => {
        if (!isMounted) return [];
        const seen = new Map<string, number>();
        return (current?.code ?? []).map((line, lineIndex) => {
            const count = (seen.get(line) ?? 0) + 1;
            seen.set(line, count);
            return {
                line,
                key: `code-line-${lineIndex}-${count}`,
            };
        });
    }, [current, isMounted]);

    return (
        <div className="w-full h-full flex flex-col pt-4 font-mono text-[9px] sm:text-[11px] leading-relaxed justify-start overflow-hidden relative">
            <div
                className="w-full h-full overflow-hidden"
                style={{ WebkitMaskImage: "linear-gradient(to bottom, black 65%, transparent 100%)", maskImage: "linear-gradient(to bottom, black 65%, transparent 100%)" }}
            >
                <AnimatePresence mode="wait">
                    <m.div
                        key={index}
                        initial={{ opacity: 0, scale: 0.98, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, filter: "blur(4px)", scale: 1.02, y: -5 }}
                        transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
                        className="flex flex-col gap-[2px] pb-12 w-full max-w-lg mx-auto pl-2 sm:pl-0"
                    >
                        {keyedCodeLines.map(({ line, key }, lineIndex) => (
                            <m.div
                                key={key}
                                initial={{ opacity: 0, x: 5 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.05 + (lineIndex * 0.015), duration: 0.2 }}
                                className="flex items-start gap-2 sm:gap-4 w-full"
                            >
                                <span className="text-neutral-400 dark:text-workspace-border/50 select-none hidden md:inline-block w-4 sm:w-6 text-right shrink-0">
                                    {lineIndex + 1}
                                </span>
                                <div className="relative w-full overflow-hidden">
                                    <span className={cn(current?.accent, "font-semibold whitespace-pre tracking-tight")}>
                                        {line || " "}
                                    </span>
                                </div>
                            </m.div>
                        ))}

                        {isMounted && (
                            <m.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.05 + (keyedCodeLines.length * 0.015) }}
                                className="flex items-start gap-2 sm:gap-4 w-full mt-1"
                            >
                                <span className="hidden md:inline-block w-4 sm:w-6 shrink-0" />
                                <m.span
                                    animate={{ opacity: [1, 0, 1] }}
                                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                    className="inline-block w-1.5 sm:w-2 h-3 sm:h-3.5 bg-blue-500/80 dark:bg-workspace-accent/60"
                                />
                            </m.div>
                        )}
                    </m.div>
                </AnimatePresence>
            </div>

            <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 flex items-center gap-1.5 sm:gap-2 text-neutral-500 dark:text-workspace-foreground/40 text-[8px] sm:text-[10px] uppercase tracking-widest font-mono">
                <Cpu className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                Writing Code
            </div>
        </div>
    );
});
