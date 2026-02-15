"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CopyButtonProps {
    content: string;
    className?: string;
}

export function CopyButton({ content, className = "" }: CopyButtonProps) {
    const [isCopied, setIsCopied] = useState(false);

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(content);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };

    return (
        <button
            onClick={copyToClipboard}
            className={`flex items-center justify-center p-1.5 rounded-md hover:bg-foreground/[0.05] dark:hover:bg-foreground/[0.1] text-muted-foreground/60 hover:text-foreground transition-all duration-200 ${className}`}
            title="Copy code"
        >
            <AnimatePresence mode="wait" initial={false}>
                {isCopied ? (
                    <motion.div
                        key="check"
                        initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="copy"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        <Copy className="w-3.5 h-3.5" />
                    </motion.div>
                )}
            </AnimatePresence>
        </button>
    );
}
