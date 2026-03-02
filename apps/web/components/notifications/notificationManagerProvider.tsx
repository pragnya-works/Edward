"use client";

import type { ReactNode } from "react";
import { useNotificationManager } from "@/hooks/useNotificationManager";

export function NotificationManagerProvider({ children }: { children: ReactNode }) {
  useNotificationManager();
  return <>{children}</>;
}
