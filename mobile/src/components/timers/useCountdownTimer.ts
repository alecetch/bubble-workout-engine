import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CountdownTimerOptions = {
  initialSeconds?: number | null;
};

type CountdownTimerResult = {
  isRunning: boolean;
  displaySeconds: number;
  isComplete: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
};

export function useCountdownTimer({
  initialSeconds = null,
}: CountdownTimerOptions): CountdownTimerResult {
  const [isRunning, setIsRunning] = useState(false);
  const [displaySeconds, setDisplaySeconds] = useState(initialSeconds ?? 0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCountdown = initialSeconds != null && Number.isFinite(initialSeconds);

  useEffect(() => {
    setIsRunning(false);
    setDisplaySeconds(initialSeconds ?? 0);
  }, [initialSeconds]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setDisplaySeconds((current) => {
        if (isCountdown) {
          if (current <= 1) {
            setIsRunning(false);
            return 0;
          }
          return current - 1;
        }
        return current + 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isCountdown, isRunning]);

  const start = useCallback(() => {
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setDisplaySeconds(initialSeconds ?? 0);
  }, [initialSeconds]);

  const isComplete = useMemo(() => isCountdown && displaySeconds === 0, [displaySeconds, isCountdown]);

  return {
    isRunning,
    displaySeconds,
    isComplete,
    start,
    pause,
    reset,
  };
}
