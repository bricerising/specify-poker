import { useEffect, useState } from "react";

export interface TimerState {
  remainingMs: number;
  remainingSeconds: number;
  isExpired: boolean;
  isUrgent: boolean;
  isCritical: boolean;
  formatted: string;
}

export function useTimer(deadlineTs: string | null): TimerState {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!deadlineTs) {
      return;
    }
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [deadlineTs]);

  if (!deadlineTs) {
    return {
      remainingMs: 0,
      remainingSeconds: 0,
      isExpired: true,
      isUrgent: false,
      isCritical: false,
      formatted: "--:--",
    };
  }

  const deadline = Date.parse(deadlineTs);
  const remainingMs = Math.max(0, deadline - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formatted = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return {
    remainingMs,
    remainingSeconds,
    isExpired: remainingMs <= 0,
    isUrgent: remainingSeconds <= 10 && remainingSeconds > 5,
    isCritical: remainingSeconds <= 5,
    formatted,
  };
}
