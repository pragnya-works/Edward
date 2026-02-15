import { useEffect, useRef, useState } from "react";

export function useTimer(isActive: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isActive) return;

    startRef.current = Date.now();
    setElapsed(0);

    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  return elapsed;
}
