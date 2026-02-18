"use client";

import { useEffect, useRef } from "react";
import { useTabVisibility } from "./useTabVisibility";

export function useVisibilityAwareInterval(
  callback: () => void,
  delay: number,
) {
  const savedCallback = useRef(callback);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDocumentVisible = useTabVisibility();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!isDocumentVisible) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (intervalRef.current) {
      return;
    }

    intervalRef.current = setInterval(() => {
      savedCallback.current();
    }, delay);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [delay, isDocumentVisible]);
}
