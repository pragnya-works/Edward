"use client";

import { useSession } from "@/lib/auth-client";
import { AppSidebar } from "@edward/ui/components/ui/appSidebar";
import { SidebarProvider } from "@edward/ui/components/sidebar";
import { cn } from "@edward/ui/lib/utils";
import { ReactNode, useState } from "react";
import UserProfile from "../userProfile";
import { LoaderIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRecentChats } from "@/hooks/useRecentChats";

interface ConditionalSidebarLayoutProps {
  children: ReactNode;
}

export default function ConditionalSidebarLayout({
  children,
}: ConditionalSidebarLayoutProps) {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isChatConversationRoute = pathname.startsWith("/chat/");
  const {
    projects: recentChats,
    total: recentChatsTotal,
    isLoading: isRecentChatsLoading,
  } =
    useRecentChats();

  if (isPending && !isChatConversationRoute) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoaderIcon className="h-8 w-8 animate-spin text-primary/70" />
      </div>
    );
  }

  if (session?.user) {
    return (
      <SidebarProvider open={open} setOpen={setOpen} animate={true}>
        <div
          className={cn(
            "rounded-md flex flex-col md:flex-row bg-gray-100 dark:bg-neutral-800 w-full flex-1 mx-auto border border-neutral-200 dark:border-neutral-700 overflow-hidden",
            "h-[100dvh] sm:h-screen",
          )}
        >
          <AppSidebar
            open={open}
            setOpen={setOpen}
            recentChats={recentChats}
            recentChatsTotal={recentChatsTotal}
            isRecentChatsLoading={isRecentChatsLoading}
            recentProjectsHref="/?section=recent-projects"
          >
            <UserProfile />
          </AppSidebar>
          <div className="flex flex-1 min-h-0 min-w-0">
            <div className="p-1.5 sm:p-0 rounded-tl-xl sm:rounded-tl-2xl border border-neutral-200 dark:border-neutral-700 md:border-l-0 bg-white dark:bg-neutral-900 flex flex-col gap-1.5 sm:gap-2 flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden">
              {children}
            </div>
          </div>
        </div>
      </SidebarProvider>
    );
  }
  return <div className="min-h-[100dvh] sm:min-h-screen">{children}</div>;
}
