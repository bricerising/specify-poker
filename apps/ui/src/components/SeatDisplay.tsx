import React from "react";

import { TableSeat } from "../state/tableStore";
import { formatChipsWithCommas } from "../utils/chipFormatter";

interface SeatDisplayProps {
  seat: TableSeat;
  isCurrentUser: boolean;
  isCurrentTurn: boolean;
  isDealer?: boolean;
  privateCards?: string[] | null;
}

export function SeatDisplay({
  seat,
  isCurrentUser,
  isCurrentTurn,
  isDealer = false,
  privateCards,
}: SeatDisplayProps) {
  const normalizedStatus = seat.status.trim().toLowerCase();
  const statusClass = normalizedStatus === "folded" ? "folded" : "";
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

    if (normalizedStatus === "active" || normalizedStatus === "all_in") {
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
      <div className="seat-badge empty">
        <div className="seat-avatar seat-avatar-empty">+</div>
        <div className="seat-info">
          <div className="seat-name">Seat {seat.seatId + 1}</div>
          <div className="seat-stack">Open</div>
        </div>
      </div>
    );
  }

  const name = seat.nickname ?? (isCurrentUser ? "You" : `Player ${seat.seatId + 1}`);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className={`seat-badge ${statusClass} ${turnClass} ${youClass}`}>
      <div className="seat-avatar">{initials || "P"}</div>
      {isDealer ? <div className="dealer-button" aria-label="Dealer button">D</div> : null}
      {normalizedStatus === "folded" ? <div className="seat-status-flag">Fold</div> : null}
      {renderCards()}
      <div className="seat-info">
        <div className="seat-name">{name}</div>
        <div className="seat-stack">{formatChipsWithCommas(seat.stack)}</div>
      </div>
    </div>
  );
}
