import { useEffect, useRef, useState } from "react";

export function useMinimumLoadingDuration(
  isLoading: boolean,
  minimumDurationMs = 1000,
): boolean {
  const [isVisible, setIsVisible] = useState(isLoading);
  const loadingStartedAtRef = useRef<number | null>(isLoading ? Date.now() : null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    if (isLoading) {
      if (loadingStartedAtRef.current === null) {
        loadingStartedAtRef.current = Date.now();
      }
      setIsVisible(true);
      return;
    }

    const startedAt = loadingStartedAtRef.current;
    if (startedAt === null) {
      setIsVisible(false);
      return;
    }

    const elapsed = Date.now() - startedAt;
    const remaining = minimumDurationMs - elapsed;

    if (remaining <= 0) {
      loadingStartedAtRef.current = null;
      setIsVisible(false);
      return;
    }

    hideTimeoutRef.current = setTimeout(() => {
      loadingStartedAtRef.current = null;
      setIsVisible(false);
    }, remaining);

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };
  }, [isLoading, minimumDurationMs]);

  return isVisible;
}
