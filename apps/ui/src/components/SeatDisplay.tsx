import React from 'react';

import type { TableSeat } from '../state/tableStore';
import { formatChipsWithCommas } from '../utils/chipFormatter';
import { PlayingCard } from './PlayingCard';

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
  const statusClass = normalizedStatus === 'folded' ? 'folded' : '';
  const turnClass = isCurrentTurn ? 'is-turn' : '';
  const youClass = isCurrentUser ? 'is-you' : '';

  const renderCards = () => {
    if (isCurrentUser && privateCards && privateCards.length === 2) {
      return (
        <div className="seat-cards">
          {privateCards.map((card, index) => (
            <PlayingCard key={`${card}-${index}`} card={card} />
          ))}
        </div>
      );
    }

    if (normalizedStatus === 'active' || normalizedStatus === 'all_in') {
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

  const username = typeof seat.username === 'string' ? seat.username.trim() : '';
  const name = username.length > 0 ? username : isCurrentUser ? 'You' : `Player ${seat.seatId + 1}`;

  return (
    <div className={`seat-badge ${statusClass} ${turnClass} ${youClass}`}>
      <div className="seat-avatar">
        {seat.avatarUrl ? (
          <img src={seat.avatarUrl} alt={`${name} avatar`} loading="lazy" decoding="async" />
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Zm0 2c-4 0-7.2 2.2-7.2 4.9V21h14.4v-2.1C19.2 16.2 16 14 12 14Z"
            />
          </svg>
        )}
      </div>
      {isDealer ? (
        <div className="dealer-button" aria-label="Dealer button">
          D
        </div>
      ) : null}
      {normalizedStatus === 'folded' ? <div className="seat-status-flag">Fold</div> : null}
      {renderCards()}
      <div className="seat-info">
        <div className="seat-name">{name}</div>
        <div className="seat-stack">{formatChipsWithCommas(seat.stack)}</div>
      </div>
    </div>
  );
}
