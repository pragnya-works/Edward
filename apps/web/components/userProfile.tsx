"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@edward/ui/components/avatar";
import { Button } from "@edward/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuPositioner,
} from "@edward/ui/components/ui/dropdown-menu";
import { LogOut, Key } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  AnimatedThemeToggler,
  type AnimatedThemeTogglerHandle,
} from "@edward/ui/components/animated-theme-toggler";
import { useSidebar } from "@edward/ui/components/sidebar";
import { cn } from "@edward/ui/lib/utils";
import { useMobileViewport } from "@edward/ui/hooks/useMobileViewport";
import { captureException } from "@sentry/nextjs";
import { toast } from "@edward/ui/components/sonner";
import { Badge } from "@edward/ui/components/badge";
import { useRateLimitScope } from "@/hooks/rateLimit/useRateLimitScope";
import { formatRateLimitResetTime, RATE_LIMIT_SCOPE } from "@/lib/rateLimit/scopes";
import { RATE_LIMIT_POLICY_BY_SCOPE } from "@edward/shared/constants";
import {
  useRateLimitQuotaScope,
  type RateLimitQuotaScopeState,
} from "@/hooks/rateLimit/useRateLimitQuotaScope";
import { syncRateLimitStorageOwner } from "@/lib/rateLimit/state.persistence";

interface UserProfileProps {
  onManageApiKeys: () => void;
}

function getProgressClass(
  remainingPercent: number,
  hasQuotaData: boolean,
  isDailyLimitReached: boolean,
): string {
  if (!hasQuotaData && !isDailyLimitReached) {
    return "from-sky-500 to-cyan-400";
  }
  if (remainingPercent <= 10) {
    return "from-rose-600 to-red-500";
  }
  if (remainingPercent <= 30) {
    return "from-orange-500 to-amber-400";
  }
  if (remainingPercent <= 60) {
    return "from-yellow-500 to-lime-400";
  }
  return "from-emerald-500 to-cyan-400";
}

function getDailyQuotaDisplay(
  isDailyLimitReached: boolean,
  chatDailyQuota: RateLimitQuotaScopeState,
  effectiveDailyLimit: number,
): {
  used: number | null;
  remaining: number | null;
  remainingPercent: number;
  progressClass: string;
} {
  const normalizedDailyLimit = Math.max(effectiveDailyLimit, 0);
  const clampedRemaining = chatDailyQuota.hasData
    ? Math.min(
        Math.max(chatDailyQuota.remaining ?? 0, 0),
        normalizedDailyLimit,
      )
    : null;

  const used = isDailyLimitReached
    ? normalizedDailyLimit
    : chatDailyQuota.hasData
      ? (chatDailyQuota.used ?? 0)
      : null;

  const remaining = isDailyLimitReached
    ? 0
    : clampedRemaining;

  const remainingPercent = isDailyLimitReached
    ? 0
    : chatDailyQuota.hasData
      ? Math.min(
          Math.max(((clampedRemaining ?? 0) / Math.max(normalizedDailyLimit, 1)) * 100, 0),
          100,
        )
      : 100;

  return {
    used,
    remaining,
    remainingPercent,
    progressClass: getProgressClass(remainingPercent, chatDailyQuota.hasData, isDailyLimitReached),
  };
}

export default function UserProfile({ onManageApiKeys }: UserProfileProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const themeTogglerRef = useRef<AnimatedThemeTogglerHandle>(null);
  const { open, setOpen } = useSidebar();
  const isMobile = useMobileViewport();
  const isExpanded = open || isMobile;
  const userId = session?.user?.id ?? null;
  const chatDailyRateLimit = useRateLimitScope(RATE_LIMIT_SCOPE.CHAT_DAILY);
  const chatDailyQuota = useRateLimitQuotaScope(RATE_LIMIT_SCOPE.CHAT_DAILY);
  const chatDailyLimit = RATE_LIMIT_POLICY_BY_SCOPE[RATE_LIMIT_SCOPE.CHAT_DAILY].max;
  const effectiveDailyLimit = chatDailyQuota.limit ?? chatDailyLimit;
  const safeDailyLimit = Math.max(effectiveDailyLimit, 0);
  const isDailyLimitReached = chatDailyRateLimit.isActive;
  const {
    used: messagesUsed,
    remaining: messagesRemaining,
    remainingPercent,
    progressClass: remainingProgressClassName,
  } = getDailyQuotaDisplay(isDailyLimitReached, chatDailyQuota, safeDailyLimit);
  const resetAt = chatDailyRateLimit.resetAt ?? chatDailyQuota.resetAt;

  useEffect(() => {
    if (!userId) {
      return;
    }
    syncRateLimitStorageOwner(userId);
  }, [userId]);

  function closeMobileSidebar() {
    if (isMobile) setOpen(false);
  }

  if (!session?.user) {
    return null;
  }

  const user = session.user;

  async function handleSignOut() {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      captureException(error);
      toast.error("Sign-out failed, please try again");
    }
  }

  return (
    <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className={cn(
                "relative group/sidebar",
                isExpanded
                  ? "flex items-center justify-start gap-2 py-2 w-full h-auto px-0"
                  : "mx-auto h-12 w-12 flex items-center justify-center px-0 !bg-transparent hover:!bg-transparent dark:hover:!bg-transparent active:!bg-transparent",
              )}
            >
              <Avatar
                className={cn("shrink-0", isExpanded ? "h-8 w-8" : "h-10 w-10")}
              >
                <AvatarImage
                  src={user.image || ""}
                  alt={user.name || "User profile"}
                />
                <AvatarFallback>
                  {user.name?.charAt(0)?.toUpperCase() ||
                    user.email?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  "text-neutral-700 dark:text-neutral-200 text-sm whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform] duration-200",
                  isExpanded
                    ? "max-w-50 opacity-100 translate-x-0 group-hover/sidebar:translate-x-1"
                    : "max-w-0 opacity-0 -translate-x-1",
                )}
              >
                {user.name || "User"}
              </span>
            </Button>
          }
        ></DropdownMenuTrigger>
        <DropdownMenuPositioner side="top" align="start" sideOffset={10} className="z-[200]">
          <DropdownMenuContent className="w-72 rounded-xl bg-card/60 backdrop-blur-md border-border/70 p-1.5">
            <div className="flex flex-col space-y-1.5 p-2">
              <p className="text-sm font-medium">{user.name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate max-w-37.5">
                {user.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <DropdownMenuLabel className="px-0 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Daily usage limits
              </DropdownMenuLabel>
              <div className="mt-1.5 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">Messages</span>
                  <Badge
                    variant={isDailyLimitReached ? "destructive" : "secondary"}
                    className="h-5 px-1.5 text-[10px]"
                  >
                    {isDailyLimitReached ? "Limit reached" : "Available"}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {messagesUsed !== null && messagesRemaining !== null
                    ? `${messagesUsed}/${safeDailyLimit} used • ${messagesRemaining} remaining`
                    : `${safeDailyLimit} messages per 24h`}
                </p>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/70"
                  role="progressbar"
                  aria-label="Daily messages remaining"
                  aria-valuemin={0}
                  aria-valuemax={safeDailyLimit}
                  aria-valuenow={messagesRemaining ?? safeDailyLimit}
                  aria-valuetext={`${messagesRemaining ?? safeDailyLimit} of ${safeDailyLimit} messages remaining`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full bg-gradient-to-r motion-safe:transition-[width,background-image] motion-safe:duration-300 motion-reduce:transition-none motion-reduce:duration-0",
                      remainingProgressClassName,
                    )}
                    style={{ width: `${remainingPercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {resetAt
                    ? `Resets at ${formatRateLimitResetTime(resetAt)}`
                    : "Resets on a rolling 24h window"}
                </p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onManageApiKeys}>
              <Key className="mr-2 h-4 w-4" />
              <span>Manage API Keys</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                closeMobileSidebar();
                themeTogglerRef.current?.toggleTheme();
              }}
            >
              <AnimatedThemeToggler ref={themeTogglerRef} />
              <span className="ml-2">Change theme</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { closeMobileSidebar(); handleSignOut(); }}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPositioner>
    </DropdownMenu>
  );
}
