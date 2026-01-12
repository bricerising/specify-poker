import React from "react";

import { SeatDisplay } from "./SeatDisplay";
import { TableSeat } from "../state/tableStore";

interface TableLayoutProps {
  seats: TableSeat[];
  currentUserSeatId: number | null;
  currentTurnSeatId: number | null;
  privateCards?: string[] | null;
}

export function TableLayout({
  seats,
  currentUserSeatId,
  currentTurnSeatId,
  privateCards,
}: TableLayoutProps) {
  return (
    <div className="table-layout">
      <div className="table-felt">
        <div className="table-center" />
      </div>
      <div className="seat-grid">
        {seats.map((seat) => (
          <SeatDisplay
            key={seat.seatId}
            seat={seat}
            isCurrentUser={seat.seatId === currentUserSeatId}
            isCurrentTurn={seat.seatId === currentTurnSeatId}
            privateCards={seat.seatId === currentUserSeatId ? privateCards : null}
          />
        ))}
      </div>
    </div>
  );
}
