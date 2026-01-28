import React from 'react';

import { SeatDisplay } from './SeatDisplay';
import type { TableSeat } from '../state/tableStore';

interface TableLayoutProps {
  seats: TableSeat[];
  currentUserSeatId: number | null;
  currentTurnSeatId: number | null;
  buttonSeatId?: number | null;
  privateCards?: string[] | null;
  children?: React.ReactNode;
}

export function TableLayout({
  seats,
  currentUserSeatId,
  currentTurnSeatId,
  buttonSeatId = null,
  privateCards,
  children,
}: TableLayoutProps) {
  const seatCount = seats.length;
  const anchorSeatId = currentUserSeatId ?? 0;

  const seatPosition = (seatId: number) => {
    if (seatCount <= 0) {
      return { left: '50%', top: '50%' };
    }
    const normalizedSeatId = ((seatId % seatCount) + seatCount) % seatCount;
    const relative = (((normalizedSeatId - anchorSeatId) % seatCount) + seatCount) % seatCount;
    const step = (Math.PI * 2) / seatCount;
    const angle = Math.PI / 2 - relative * step;

    const rx = seatCount <= 4 ? 40 : seatCount <= 6 ? 44 : 46;
    const ry = seatCount <= 4 ? 32 : seatCount <= 6 ? 36 : 38;

    const left = 50 + Math.cos(angle) * rx;
    const top = 50 + Math.sin(angle) * ry;
    return { left: `${left}%`, top: `${top}%` };
  };

  return (
    <div className="table-layout">
      <div className="table-felt">
        <div className="table-center">{children}</div>
      </div>
      <div className="seat-ring">
        {seats.map((seat) => {
          const isCurrentUser = seat.seatId === currentUserSeatId;
          const isCurrentTurn = seat.seatId === currentTurnSeatId;
          const isDealer = buttonSeatId !== null && seat.seatId === buttonSeatId;
          return (
            <div
              key={seat.seatId}
              className={`seat-slot${isCurrentUser ? ' is-you' : ''}${isCurrentTurn ? ' is-turn' : ''}`}
              style={seatPosition(seat.seatId)}
            >
              <SeatDisplay
                seat={seat}
                isCurrentUser={isCurrentUser}
                isCurrentTurn={isCurrentTurn}
                isDealer={isDealer}
                privateCards={isCurrentUser ? privateCards : null}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
