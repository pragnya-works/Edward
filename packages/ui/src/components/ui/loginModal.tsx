"use client";

import { useState, useCallback } from "react";
import { Github } from "lucide-react";

import { Button } from "@edward/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@edward/ui/components/dialog";

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
      <DialogContent className="sm:max-w-sm border-border bg-background p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-8 pb-6">
          <DialogHeader className="space-y-4 text-center">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Sign in to continue
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Access your account to start building with Edward.
            </p>
          </DialogHeader>
        </div>

        <div className="px-6 pb-8">
          <Button
            type="button"
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full h-11 rounded-lg font-medium bg-foreground text-background hover:bg-foreground/90"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                <span>Connecting...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Github className="w-4 h-4" />
                Continue with GitHub
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
