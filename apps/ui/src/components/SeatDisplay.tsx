import React from "react";

import { TableSeat } from "../state/tableStore";

interface SeatDisplayProps {
  seat: TableSeat;
  isCurrentUser: boolean;
  isCurrentTurn: boolean;
  privateCards?: string[] | null;
}

export function SeatDisplay({
  seat,
  isCurrentUser,
  isCurrentTurn,
  privateCards,
}: SeatDisplayProps) {
  const statusClass = seat.status === "folded" ? "folded" : "";
  const turnClass = isCurrentTurn ? "is-turn" : "";
  const youClass = isCurrentUser ? "is-you" : "";

  const renderCards = () => {
    if (isCurrentUser && privateCards && privateCards.length === 2) {
      return (
        <div className="seat-cards">
          {privateCards.map((card, index) => (
            <span key={`${card}-${index}`} className="playing-card">
              {card}
            </span>
          ))}
        </div>
      );
    }

    if (seat.status === "active" || seat.status === "all_in") {
      return (
        <div className="seat-cards">
          <span className="card-back" />
          <span className="card-back" />
        </div>
      );
    }

    return null;
  };

  if (!seat.userId) {
    return (
      <div className={`seat-card empty`}>
        <strong>Seat {seat.seatId + 1}</strong>
        <div className="meta-line">Open seat</div>
      </div>
    );
  }

  return (
    <div className={`seat-card ${statusClass} ${turnClass} ${youClass}`}>
      <strong>Seat {seat.seatId + 1}</strong>
      <div className="seat-player">{seat.nickname ?? seat.userId}</div>
      <div className="seat-stack">Stack: {seat.stack}</div>
      <div className="seat-status">{seat.status}</div>
      {renderCards()}
    </div>
  );
}
