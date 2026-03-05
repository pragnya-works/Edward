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

function isNavigatorWithUserAgentData(
  nav: Navigator,
): nav is NavigatorWithUserAgentData {
  return "userAgentData" in nav;
}

function getMacSnapshot(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const nav = navigator;
  const platformLabel = isNavigatorWithUserAgentData(nav)
    ? nav.userAgentData?.platform ?? nav.userAgent
    : nav.userAgent;

  return /\bMacintosh\b|\bMacIntel\b|\bmacOS\b/i.test(platformLabel);
}

export function useIsMac(): boolean {
  return useSyncExternalStore(subscribeNoop, getMacSnapshot, () => false);
}
