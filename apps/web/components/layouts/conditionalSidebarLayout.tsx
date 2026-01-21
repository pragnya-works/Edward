"use client";

import { useSession } from "@/lib/auth-client";
import { SidebarProvider, SidebarInset } from "@workspace/ui/components/sidebar";
import { AppSidebar } from "@workspace/ui/components/ui/appSidebar";
import Link from "next/link";
import { ReactNode } from "react";

interface ConditionalSidebarLayoutProps {
  children: ReactNode;
}

export default function ConditionalSidebarLayout({ children }: ConditionalSidebarLayoutProps) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (session?.user) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar LinkComponent={Link} />
          <SidebarInset>
            <main className="flex flex-1 flex-col">
              {children}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }
  return <div>{children}</div>;
}