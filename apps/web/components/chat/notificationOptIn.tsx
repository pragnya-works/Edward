"use client";

import { useCallback, useMemo, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { Button } from "@edward/ui/components/button";
import { Avatar, AvatarFallback } from "@edward/ui/components/avatar";
import { Card, CardContent } from "@edward/ui/components/card";
import { toast } from "@edward/ui/components/sonner";
import { cn } from "@edward/ui/lib/utils";
import { useChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";
import { useNotificationsStore } from "@/stores/notifications/store";
import { useSandboxStore } from "@/stores/sandbox/store";
import { BuildStatus } from "@/stores/sandbox/types";

interface NotificationOptInProps {
  chatId: string;
  suppressWhenTopContextVisible?: boolean;
}

export function NotificationOptIn({
  chatId,
  suppressWhenTopContextVisible = false,
}: NotificationOptInProps) {
  const { projectName, stream } = useChatWorkspaceContext();
  const buildStatus = useSandboxStore((s) => s.buildStatus);
  const isSubscribed = useNotificationsStore((s) => s.isSubscribed(chatId));
  const subscribe = useNotificationsStore((s) => s.subscribe);
  const unsubscribe = useNotificationsStore((s) => s.unsubscribe);
  const browserPermission = useNotificationsStore((s) => s.browserPermission);
  const setBrowserPermission = useNotificationsStore((s) => s.setBrowserPermission);
  const hasHydrated = useNotificationsStore((s) => s.hasHydrated);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const hasBuildActivity = useMemo(
    () =>
      buildStatus !== BuildStatus.IDLE ||
      stream.isSandboxing ||
      stream.installingDeps.length > 0 ||
      stream.completedFiles.length > 0 ||
      Boolean(projectName),
    [
      buildStatus,
      projectName,
      stream.completedFiles.length,
      stream.installingDeps.length,
      stream.isSandboxing,
    ],
  );

  const handleToggle = useCallback(async () => {
    if (isSubscribed) {
      unsubscribe(chatId);
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      setBrowserPermission("unsupported");
      const title = projectName ?? "Untitled app";
      subscribe(chatId, title);
      return;
    }

    let permission = Notification.permission;
    if (permission === "default") {
      setIsRequestingPermission(true);
      try {
        permission = await Notification.requestPermission();
      } finally {
        setIsRequestingPermission(false);
      }
    }

    setBrowserPermission(permission);
    if (permission === "denied") {
      toast.error("Browser notifications are blocked", {
        description:
          "Allow notifications in your browser settings to receive system alerts.",
      });
    }

    const title = projectName ?? "Untitled app";
    subscribe(chatId, title);
  }, [
    chatId,
    isSubscribed,
    projectName,
    setBrowserPermission,
    subscribe,
    unsubscribe,
  ]);

  if (!hasHydrated || (!hasBuildActivity && !isSubscribed)) {
    return null;
  }

  const isBuilding =
    buildStatus === BuildStatus.QUEUED ||
    buildStatus === BuildStatus.BUILDING ||
    stream.isSandboxing;

  const subtitle = isSubscribed
    ? browserPermission === "granted"
      ? "In-app and browser alerts are enabled"
      : "In-app alerts are enabled"
    : "Enable to receive build alerts when this chat is not active";

  return (
    <m.div
      initial={false}
      animate={
        suppressWhenTopContextVisible
          ? {
              opacity: 0,
              height: 0,
              marginBottom: 0,
              y: -6,
            }
          : {
              opacity: 1,
              height: "auto",
              marginBottom: 8,
              y: 0,
            }
      }
      transition={{
        duration: prefersReducedMotion ? 0 : 0.2,
        ease: [0.22, 1, 0.36, 1],
      }}
      aria-hidden={suppressWhenTopContextVisible}
      inert={suppressWhenTopContextVisible || undefined}
      className={cn("overflow-hidden", suppressWhenTopContextVisible && "pointer-events-none")}
    >
      <Card
        className={cn(
          "py-0 shadow-none",
          isSubscribed
            ? "border-sky-400/20 bg-sky-500/5 dark:border-sky-400/15 dark:bg-sky-500/8"
            : "border-zinc-400/60 bg-zinc-100/60 dark:border-zinc-700/60 dark:bg-zinc-800/40",
          "backdrop-blur-sm transition-all duration-300",
        )}
      >
        <CardContent className="flex items-center justify-between gap-3 px-3.5 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar
              className={cn(
                "h-7 w-7 rounded-lg",
                isSubscribed
                  ? "bg-sky-500/15 dark:bg-sky-500/20"
                  : "bg-zinc-200/80 dark:bg-zinc-800/60",
              )}
            >
              <AvatarFallback
                className={cn(
                  "h-7 w-7 rounded-lg text-current",
                  isSubscribed
                    ? "bg-sky-500/15 text-sky-400 dark:bg-sky-500/20"
                    : "bg-zinc-200/80 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400",
                )}
              >
                {isSubscribed ? (
                  <BellRing
                    className={cn(
                      "h-3.5 w-3.5",
                      isBuilding && !prefersReducedMotion && "animate-[wiggle_1.2s_ease-in-out_infinite]",
                    )}
                    strokeWidth={2}
                  />
                ) : (
                  <Bell className="h-3.5 w-3.5" strokeWidth={2} />
                )}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p
                className={cn(
                  "truncate text-[12px] font-medium leading-snug",
                  isSubscribed
                    ? "text-sky-700 dark:text-sky-300"
                    : "text-zinc-700 dark:text-zinc-300",
                )}
              >
                {isSubscribed
                  ? "Build notifications enabled"
                  : "Get notified when your build completes"}
              </p>
              <p className="truncate text-[10.5px] leading-snug text-zinc-500 dark:text-zinc-500">
                {subtitle}
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => {
              void handleToggle();
            }}
            disabled={isRequestingPermission}
            size="sm"
            variant={isSubscribed ? "outline" : "secondary"}
            className={cn(
              "h-7 shrink-0 gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold",
              isSubscribed
                ? "border-sky-400/25 bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 dark:bg-sky-500/15 dark:text-sky-400 dark:hover:bg-sky-500/25"
                : "border-zinc-300/60 bg-zinc-200/80 text-zinc-600 hover:bg-zinc-300/80 dark:border-zinc-700/60 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-700/60",
              isRequestingPermission && "cursor-not-allowed opacity-60",
            )}
            aria-pressed={isSubscribed}
            aria-label={
              isSubscribed
                ? "Disable build notifications"
                : "Enable build notifications"
            }
          >
            {isSubscribed ? (
              <>
                <BellOff className="h-3 w-3" strokeWidth={2} />
                Disable
              </>
            ) : (
              <>
                <Bell className="h-3 w-3" strokeWidth={2} />
                {isRequestingPermission ? "Enabling..." : "Enable"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </m.div>
  );
}
