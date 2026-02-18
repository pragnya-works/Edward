"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export function useScrollToBottom<T extends HTMLDivElement>(
  dependencies: unknown[],
) {
  const scrollRef = useRef<T>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isAutoScrolling = useRef(false);
  const lastScrollTop = useRef(0);
  const hasInitialScrolled = useRef(false);

  const checkIfNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return false;

    const threshold = 100;
    const isAtBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    const isUp = el.scrollTop < el.scrollHeight - el.clientHeight - 400;
    setShowScrollButton(isUp);

    return isAtBottom;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (bottomRef.current) {
      isAutoScrolling.current = true;
      bottomRef.current.scrollIntoView({ behavior });

      setTimeout(() => {
        isAutoScrolling.current = false;
      }, 500);
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      lastScrollTop.current = el.scrollTop;
      checkIfNearBottom();
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [checkIfNearBottom]);

  useEffect(() => {
    const isNearBottom = checkIfNearBottom();

    if (
      !hasInitialScrolled.current &&
      dependencies[0] &&
      (dependencies[0] as number) > 0
    ) {
      scrollToBottom("auto");
      hasInitialScrolled.current = true;
      return;
    }

    if (isNearBottom) {
      scrollToBottom("smooth");
    }
  }, [dependencies, scrollToBottom, checkIfNearBottom]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollToBottom("auto");
    }
  }, [scrollToBottom]);

  return {
    scrollRef,
    bottomRef,
    showScrollButton,
    scrollToBottom,
    checkIfNearBottom,
  };
}
