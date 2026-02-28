"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useSession } from "@/lib/auth-client";

export function ThemeEnforcer() {
  const { data: session, isPending } = useSession();
  const { theme, setTheme } = useTheme();
  const shouldForceDark = !isPending && !session?.user;

  useEffect(() => {
    if (shouldForceDark && theme !== "dark") {
      setTheme("dark");
    }
  }, [setTheme, shouldForceDark, theme]);

  useEffect(() => {
    if (!shouldForceDark || typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const previousColorScheme = root.style.colorScheme;
    const ensureDarkRoot = () => {
      if (!root.classList.contains("dark")) {
        root.classList.add("dark");
      }
      root.style.colorScheme = "dark";
    };

    ensureDarkRoot();

    const observer = new MutationObserver(() => {
      ensureDarkRoot();
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      observer.disconnect();
      root.style.colorScheme = previousColorScheme;
    };
  }, [shouldForceDark]);

  useEffect(() => {
    if (!shouldForceDark || typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "theme" && event.newValue !== "dark") {
        setTheme("dark");
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [setTheme, shouldForceDark]);

  return null;
}
