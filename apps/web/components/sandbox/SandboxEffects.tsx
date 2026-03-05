"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSandboxStore } from "@/stores/sandbox/store";

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function SandboxEffects({ children }: { children: ReactNode }) {
  const closeSandbox = useSandboxStore((s) => s.closeSandbox);
  const toggleSearch = useSandboxStore((s) => s.toggleSearch);
  const setRouteChatId = useSandboxStore((s) => s.setRouteChatId);
  const [shortcutAnnouncement, setShortcutAnnouncement] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    const match = pathname.match(/^\/chat\/([^/?#]+)/);
    let nextChatId: string | null = null;
    if (match?.[1]) {
      try {
        nextChatId = decodeURIComponent(match[1]);
      } catch {
        nextChatId = match[1];
      }
    }
    closeSandbox();
    setRouteChatId(nextChatId);
  }, [closeSandbox, pathname, setRouteChatId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) {
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }
      if (event.shiftKey) {
        return;
      }
      const sandboxState = useSandboxStore.getState();
      if (sandboxState.isOpen) {
        event.preventDefault();
        toggleSearch();
        setShortcutAnnouncement(
          sandboxState.isSearchOpen
            ? "Search closed via keyboard shortcut"
            : "Search opened via keyboard shortcut",
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSearch]);

  return (
    <>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {shortcutAnnouncement}
      </div>
    </>
  );
}
