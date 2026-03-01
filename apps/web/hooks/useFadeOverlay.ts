import { useEffect, useRef, useState } from "react";

export function useFadeOverlay(
  isActive: boolean,
  fadeDurationMs = 500,
): {
  visible: boolean;
  isFadingOut: boolean;
} {
  const [visible, setVisible] = useState(isActive);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(isActive);
  const fadingRef = useRef(false);

  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isActive) {
      fadingRef.current = false;
      visibleRef.current = true;
      setIsFadingOut(false);
      setVisible(true);
      return;
    }

    if (visibleRef.current && !fadingRef.current) {
      fadingRef.current = true;
      setIsFadingOut(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fadingRef.current = false;
        visibleRef.current = false;
        setIsFadingOut(false);
        setVisible(false);
      }, fadeDurationMs);
    }
  }, [isActive, fadeDurationMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { visible, isFadingOut };
}
