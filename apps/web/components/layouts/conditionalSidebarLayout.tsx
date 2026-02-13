"use client";

import { useSession } from "@/lib/auth-client";
import { AppSidebar } from "@edward/ui/components/ui/appSidebar";
import { SidebarProvider } from "@edward/ui/components/sidebar";
import { cn } from "@edward/ui/lib/utils";
import { ReactNode, useState } from "react";
import UserProfile from "../userProfile";
import { LoaderIcon } from "lucide-react";

interface ConditionalSidebarLayoutProps {
  children: ReactNode;
}

export default function ConditionalSidebarLayout({
  children,
}: ConditionalSidebarLayoutProps) {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);

  if (isPending) {
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
            "h-screen"
          )}
        >
          <AppSidebar open={open} setOpen={setOpen}>
            <UserProfile />
          </AppSidebar>
          <div className="flex flex-1 min-h-0">
            <div className="p-2 md:p-10 rounded-tl-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 flex flex-col gap-2 flex-1 w-full min-h-0 overflow-y-auto">
              {children}
            </div>
          </div>
        </div>
      </SidebarProvider>
    );
  }
  return <div>{children}</div>;
}

