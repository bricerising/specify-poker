import React from 'react';

import { useTimer } from '../hooks/useTimer';

interface TimerProps {
  deadlineTs: string | null;
  label?: string;
}

export function Timer({ deadlineTs, label = 'Action Timer' }: TimerProps) {
  const timer = useTimer(deadlineTs);

  if (!deadlineTs) {
    return null;
  }

  const urgencyClass = timer.isCritical ? 'timer-critical' : timer.isUrgent ? 'timer-urgent' : '';

  return (
    <div className={`timer-pill ${urgencyClass}`}>
      <span>{label}</span>
      <strong>{timer.isExpired ? 'Time!' : timer.formatted}</strong>
    </div>
  );
}
