import React, { useState } from "react";

import { apiFetch } from "../services/apiClient";
import { TableSeat } from "../state/tableStore";

interface ModerationMenuProps {
  tableId: string;
  seats: TableSeat[];
  onModeration?: () => void;
}

export function ModerationMenu({ tableId, seats, onModeration }: ModerationMenuProps) {
  const [error, setError] = useState<string | null>(null);
  const seated = seats.filter((seat) => seat.userId);

  const request = async (path: string, seatId: number) => {
    try {
      await apiFetch(`/api/tables/${tableId}/moderation/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatId }),
      });
      setError(null);
      onModeration?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Moderation failed";
      setError(message);
    }
  };

  return (
    <section className="card moderation-panel">
      <h3>Moderation</h3>
      {seated.length === 0 ? (
        <div className="meta-line">No seated players.</div>
      ) : (
        seated.map((seat) => (
          <div key={seat.seatId} className="moderation-seat">
            <div>
              <strong>Seat {seat.seatId + 1}</strong>: {seat.nickname ?? seat.userId}
            </div>
            <div className="action-buttons">
              <button type="button" className="btn btn-quiet" onClick={() => request("kick", seat.seatId)}>
              Kick
            </button>
              <button type="button" className="btn" onClick={() => request("mute", seat.seatId)}>
              Mute
            </button>
            </div>
          </div>
        ))
      )}
      {error ? (
        <div role="alert" className="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
