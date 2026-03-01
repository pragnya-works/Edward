"use client";
import {
  SidebarBody,
  SidebarLink,
  SidebarTrigger,
  useSidebar,
} from "@edward/ui/components/sidebar";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  ScrollText,
  ChevronRight,
  FolderClock,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipPositioner,
  TooltipTrigger,
} from "@edward/ui/components/tooltip";
import { KeyboardShortcut } from "@edward/ui/components/ui/keyboardShortcut";
import { useCallback, useSyncExternalStore } from "react";
import {
  LOCATION_CHANGE_EVENT,
  quickScrollToRecentProjects,
} from "@edward/ui/lib/recentProjectsScroll";
import { EdwardLogo } from "@edward/ui/components/brand/edwardLogo";
import { useMobileViewport } from "@edward/ui/hooks/useMobileViewport";

export interface SidebarRecentChat {
  id: string;
  title: string | null;
  updatedAt: Date | string;
}

interface AppSidebarProps {
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  children?: React.ReactNode;
  recentChats?: SidebarRecentChat[];
  recentChatsTotal?: number;
  isRecentChatsLoading?: boolean;
  recentProjectsHref?: string;
}

const EMPTY_RECENT_CHATS: SidebarRecentChat[] = [];
const MAX_VISIBLE_RECENT_CHATS = 4;

function formatRelativeTime(dateValue: Date | string) {
  const date = new Date(dateValue);
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const absMinutes = Math.abs(diffMinutes);

  if (absMinutes < 60) {
    return `${Math.max(1, absMinutes)}m`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) {
    return `${Math.max(1, absHours)}h`;
  }

  const diffDays = Math.round(diffHours / 24);
  const absDays = Math.abs(diffDays);
  if (absDays < 7) {
    return `${Math.max(1, absDays)}d`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getChatTitle(title: string | null) {
  const trimmed = title?.trim();
  return trimmed ? trimmed : "Untitled Project";
}

export function AppSidebar({
  children,
  recentChats = EMPTY_RECENT_CHATS,
  recentChatsTotal,
  isRecentChatsLoading = false,
  recentProjectsHref = "/?section=recent-projects",
}: AppSidebarProps) {
  const { open } = useSidebar();
  const isMobile = useMobileViewport();
  const isExpanded = open || isMobile;
  const router = useRouter();
  const pathname = usePathname();

  const handleRecentProjectsClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (pathname !== "/") {
        return;
      }

      event.preventDefault();
      const didScroll = quickScrollToRecentProjects();

      const url = new URL(window.location.href);
      url.searchParams.set("section", "recent-projects");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}`,
      );
      window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));

      if (!didScroll) {
        router.replace(recentProjectsHref, { scroll: false });
      }
    },
    [pathname, recentProjectsHref, router],
  );

  const isRouteActive = useCallback(
    (href: string) => {
      if (href === "/") {
        return pathname === "/";
      }

      return pathname === href || pathname.startsWith(`${href}/`);
    },
    [pathname],
  );

  const isChatConversationRoute = pathname.startsWith("/chat/");

  const links = [
    {
      label: "Home",
      href: "/",
      icon: (
        <Home className="text-neutral-700 dark:text-neutral-200 h-5 w-5 shrink-0" />
      ),
      isActive: isRouteActive("/"),
    },
    {
      label: "Changelog",
      href: "/changelog",
      icon: (
        <ScrollText className="text-neutral-700 dark:text-neutral-200 h-5 w-5 shrink-0" />
      ),
      isActive: isRouteActive("/changelog"),
    },
  ];
  const visibleRecentChats = recentChats.slice(0, MAX_VISIBLE_RECENT_CHATS);
  const totalRecentChats = recentChatsTotal ?? recentChats.length;

  return (
    <SidebarBody
      className={cn("justify-between", isExpanded ? "gap-10" : "gap-5")}
    >
      <ToggleHandle />
      <div
        className={cn(
          "flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden",
          !isExpanded && "items-center w-full",
        )}
      >
        <div className="flex flex-col gap-2 mb-8">
          <Logo />
        </div>
        <div
          className={cn(
            "flex flex-col gap-1.5",
            !isExpanded && "w-full items-center gap-2",
          )}
        >
          {links.map((link) => (
            <SidebarLink
              key={link.href}
              link={link}
              className={cn(
                link.isActive &&
                  (isExpanded
                    ? "bg-neutral-200 dark:bg-neutral-700/60"
                    : "border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800"),
              )}
            />
          ))}
        </div>

        <div
          className={cn(
            "mt-6",
            !isExpanded && "mt-8 w-full flex flex-col items-center",
          )}
        >
          {isExpanded ? (
            <div
              className={cn(
                "rounded-xl border border-neutral-200/80 dark:border-neutral-700/70 bg-white/70 dark:bg-neutral-900/40 backdrop-blur-sm p-2.5",
                isChatConversationRoute &&
                  "border-neutral-300/90 dark:border-neutral-600/80 bg-neutral-100/80 dark:bg-neutral-900/70",
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-200">
                  <FolderClock className="h-3.5 w-3.5" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide">
                    Recent Chats
                  </p>
                </div>
                <Link
                  href={recentProjectsHref}
                  onClick={handleRecentProjectsClick}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/70 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-neutral-800 transition-colors"
                >
                  See all
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>

              {isRecentChatsLoading ? (
                <div className="space-y-1.5 px-1 py-1">
                  <div className="h-8 rounded-md bg-neutral-200/70 dark:bg-neutral-800/80 animate-pulse" />
                  <div className="h-8 rounded-md bg-neutral-200/70 dark:bg-neutral-800/80 animate-pulse" />
                  <div className="h-8 rounded-md bg-neutral-200/70 dark:bg-neutral-800/80 animate-pulse" />
                </div>
              ) : visibleRecentChats.length > 0 ? (
                <div className="space-y-1">
                  {visibleRecentChats.map((chat) => {
                    const chatHref = `/chat/${chat.id}`;
                    const isActiveChat = pathname === chatHref;

                    return (
                      <Link
                        key={chat.id}
                        href={chatHref}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors",
                          isActiveChat &&
                            "bg-neutral-200/90 dark:bg-neutral-800 text-neutral-900 dark:text-white",
                        )}
                      >
                        <span className="truncate text-[12px] font-medium">
                          {getChatTitle(chat.title)}
                        </span>
                        <span className="shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400">
                          {formatRelativeTime(chat.updatedAt)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="px-2 py-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  No recent chats yet.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "relative flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200/85 dark:border-neutral-700/80 bg-white/90 dark:bg-neutral-900/75 shadow-sm",
                  isChatConversationRoute &&
                    "border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800",
                )}
              >
                <FolderClock className="h-4.5 w-4.5 text-neutral-600 dark:text-neutral-300" />
                {totalRecentChats > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-900 px-1 text-[9px] font-semibold leading-none text-white dark:bg-neutral-100 dark:text-neutral-900">
                    {totalRecentChats > 99 ? "99+" : totalRecentChats}
                  </span>
                )}
              </div>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href={recentProjectsHref}
                      onClick={handleRecentProjectsClick}
                      aria-label="See all recent projects"
                      className="mt-1 flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200/85 bg-white/90 text-neutral-600 hover:text-neutral-900 hover:bg-white dark:border-neutral-700/80 dark:bg-neutral-900/70 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-neutral-900 transition-colors"
                    >
                      <ArrowUpRight className="h-4.5 w-4.5" />
                    </Link>
                  }
                />
                <TooltipPositioner side="right">
                  <TooltipContent>See all projects</TooltipContent>
                </TooltipPositioner>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
      <div
        className={cn("flex flex-col gap-2", !isExpanded && "items-center pb-1")}
      >
        {children}
      </div>
    </SidebarBody>
  );
}

const ToggleHandle = () => {
  const { open } = useSidebar();
  const isMac = useSyncExternalStore(
    () => () => undefined,
    () =>
      typeof navigator !== "undefined" &&
      navigator.platform.toUpperCase().includes("MAC"),
    () => false,
  );

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarTrigger
            className={cn(
              "absolute -right-3.5 top-9 z-40 hidden md:flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200/80 bg-white/90 backdrop-blur-sm dark:border-neutral-700/80 dark:bg-neutral-900/75 shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-all duration-200 hover:scale-105 hover:bg-white dark:hover:bg-neutral-900",
              open && "rotate-180",
            )}
          >
            <ChevronRight className="h-3 w-3 text-neutral-500 dark:text-neutral-400" />
          </SidebarTrigger>
        }
      />
      <TooltipPositioner side="right">
        <TooltipContent>
          <div className="flex items-center gap-2">
            <span>{open ? "Collapse" : "Expand"} Sidebar</span>
            <KeyboardShortcut className="gap-1 opacity-100">
              <span className="text-xs">{isMac ? "⌘" : "Ctrl"}</span>B
            </KeyboardShortcut>
          </div>
        </TooltipContent>
      </TooltipPositioner>
    </Tooltip>
  );
};

export const Logo = () => {
  const { open } = useSidebar();
  const isMobile = useMobileViewport();
  const isExpanded = open || isMobile;
  const logoSize = isExpanded ? 24 : 44;

  return (
    <Link
      href="/"
      className={cn(
        "font-normal flex items-center text-sm text-black relative z-20",
        isExpanded
          ? "space-x-2 py-1"
          : "justify-center rounded-xl border-2 border-neutral-200/85 dark:border-neutral-700/80 bg-white/90 dark:bg-neutral-900/75 shadow-sm",
      )}
    >
      <EdwardLogo
        size={logoSize}
        priority
        quality={78}
        sizes={isExpanded ? "24px" : "44px"}
        className={cn("rounded-md", !isExpanded && "h-11 w-11 rounded-xl")}
      />
      <span
        className={cn(
          "font-medium text-black dark:text-white whitespace-pre overflow-hidden transition-[max-width,opacity,transform] duration-200",
          isExpanded
            ? "max-w-30 opacity-100 translate-x-0"
            : "max-w-0 opacity-0 -translate-x-1",
        )}
      >
        Edward.
      </span>
    </Link>
  );
};

export const LogoIcon = () => {
  return (
    <Link
      href="/"
      className="font-normal flex space-x-2 items-center text-sm text-black py-1 relative z-20"
    >
      <EdwardLogo
        size={44}
        priority
        quality={78}
        sizes="44px"
        className="h-11 w-11 rounded-xl"
      />
    </Link>
  );
};
