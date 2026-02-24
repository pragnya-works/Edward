"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { X } from "lucide-react";
import { GitHub } from "@edward/ui/components/icons/github";
import { EdwardLogo } from "@edward/ui/components/brand/edwardLogo";
import { Button } from "@edward/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@edward/ui/components/dialog";
import { cn } from "@edward/ui/lib/utils";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn?: () => void | Promise<void>;
}

export function LoginModal({ isOpen, onClose, onSignIn }: LoginModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      await onSignIn?.();
      onClose();
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, [onSignIn, onClose]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-[440px] w-[95vw] p-0 overflow-hidden border-border/40 dark:border-white/[0.1] gap-0 shadow-2xl dark:shadow-black/60 dark:bg-[oklch(0.185_0_0)]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Sign in to Edward</DialogTitle>
        <DialogDescription className="sr-only">
          Continue with GitHub to authenticate and start using Edward.
        </DialogDescription>
        <LazyMotion features={domAnimation}>
          <AnimatePresence>
            {isOpen && (
              <m.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{
                  type: "spring",
                  damping: 28,
                  stiffness: 350,
                  duration: 0.3,
                }}
                className="relative w-full overflow-hidden bg-background dark:bg-[oklch(0.185_0_0)]"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="absolute top-4 right-4 z-20 h-8 w-8 rounded-full bg-background/80 dark:bg-white/[0.06] border border-border/40 dark:border-white/[0.12] text-muted-foreground hover:text-foreground hover:bg-muted/70 dark:hover:bg-white/[0.1] transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span className="sr-only">Close</span>
                </Button>

                <div className="relative z-10">
                  <m.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="px-6 pt-7 pb-6 border-b border-border/20 dark:border-white/[0.08] bg-background/50 dark:bg-white/[0.025] backdrop-blur-sm text-center"
                  >
                    <div className="space-y-4 w-full flex flex-col items-center">
                      <div className="inline-flex items-center justify-center rounded-xl border border-border/40 dark:border-white/[0.14] bg-muted/30 dark:bg-white/[0.08] shadow-inner">
                        <EdwardLogo
                          size={60}
                          priority
                          quality={80}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-bold tracking-tight text-foreground/90 select-none">
                          Welcome to Edward
                        </h2>
                        <p className="text-sm text-muted-foreground/80 leading-relaxed max-w-[300px] mx-auto select-none">
                          Continue with GitHub to authenticate and start your workspace session.
                        </p>
                      </div>
                    </div>
                  </m.div>

                  <m.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="px-6 py-6"
                  >
                    <Button
                      type="button"
                      onClick={handleLogin}
                      disabled={isLoading}
                      className={cn(
                        "relative w-full h-12 rounded-xl font-semibold transition-all duration-300",
                        "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md dark:shadow-lg dark:shadow-primary/10 active:scale-[0.985]",
                        "disabled:opacity-70 disabled:scale-100"
                      )}
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                          <span>Authenticating...</span>
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2.5">
                          <GitHub className="w-5 h-5" />
                          Continue with GitHub
                        </span>
                      )}
                    </Button>

                    <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 dark:text-muted-foreground/70 text-center select-none">
                      Fast & Secure Authentication
                    </p>
                  </m.div>
                </div>

                <div className="h-px w-full bg-border/30 dark:bg-white/[0.06]" />
              </m.div>
            )}
          </AnimatePresence>
        </LazyMotion>
      </DialogContent>
    </Dialog>
  );
}
