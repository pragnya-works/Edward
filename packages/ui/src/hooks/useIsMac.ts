"use client";

import { useSyncExternalStore } from "react";

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    platform?: string;
  };
}

function subscribeNoop() {
  return () => undefined;
}

function getMacSnapshot(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const nav = navigator as NavigatorWithUserAgentData;
  const platformLabel = nav.userAgentData?.platform ?? navigator.userAgent;
  return /mac/i.test(platformLabel);
}

export function useIsMac(): boolean {
  return useSyncExternalStore(subscribeNoop, getMacSnapshot, () => false);
}
