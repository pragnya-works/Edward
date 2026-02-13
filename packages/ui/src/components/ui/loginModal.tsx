"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { GitHub } from "@edward/ui/components/icons/github";
import { Button } from "@edward/ui/components/button";
import {
  Dialog,
  DialogContent,
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-[400px] border-none bg-transparent p-0 gap-0 overflow-visible shadow-none"
        showCloseButton={false}
      >
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ 
                type: "spring",
                damping: 28,
                stiffness: 350,
                duration: 0.3 
              }}
              className="relative w-full overflow-hidden rounded-[24px] border border-white/[0.04] bg-black/40 backdrop-blur-2xl shadow-[0_0_40px_-12px_rgba(0,0,0,0.4)]"
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="absolute top-4 right-4 rounded-full bg-white/[0.03] hover:bg-white/[0.08] transition-colors text-white/30 hover:text-white z-20 h-8 w-8"
              >
                <X className="w-4 h-4" />
                <span className="sr-only">Close</span>
              </Button>

              <div 
                className="absolute inset-0 opacity-[0.015] pointer-events-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                }}
              />

              <div className="absolute -top-[40%] -left-[20%] w-[80%] h-[80%] bg-blue-500/[0.01] blur-[150px] pointer-events-none" />
              <div className="absolute -bottom-[40%] -right-[20%] w-[80%] h-[80%] bg-purple-500/[0.01] blur-[150px] pointer-events-none" />

              <div className="relative z-10 p-8 pt-12 text-center">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-8 inline-flex items-center justify-center"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-white/[0.02] blur-xl rounded-full" />
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.03] border border-white/[0.05] flex items-center justify-center backdrop-blur-md">
                      <GitHub className="w-8 h-8 text-white/80" />
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-2 mb-10"
                >
                  <h2 className="text-2xl font-bold tracking-tight text-white/90 select-none">
                    Welcome to Edward
                  </h2>
                  <p className="text-sm text-white/30 leading-relaxed max-w-[280px] mx-auto select-none">
                    The next-gen AI workspace for visionary engineers and creators.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Button
                    type="button"
                    onClick={handleLogin}
                    disabled={isLoading}
                    className={cn(
                      "relative w-full h-12 rounded-xl font-semibold transition-all duration-300",
                      "bg-white/95 text-black hover:bg-white active:scale-[0.985]",
                      "shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)]",
                      "disabled:opacity-70 disabled:scale-100"
                    )}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-3">
                        <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                        <span>Authenticating...</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <GitHub className="w-5 h-5" />
                        Continue with GitHub
                      </span>
                    )}
                  </Button>
                  
                  <p className="mt-6 text-[11px] text-white/30 uppercase tracking-[0.2em] font-medium select-none">
                    Fast & Secure Authentication
                  </p>
                </motion.div>
              </div>

              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
