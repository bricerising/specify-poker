import React, { useEffect, useState } from "react";
import { trace } from "@opentelemetry/api";

import { CreateTableForm } from "../components/CreateTableForm";
import { PokerArt } from "../components/PokerArt";
import { createTable } from "../services/lobbyApi";
import { fetchProfile, UserProfile } from "../services/profileApi";
import { TableStore, tableStore, TableSummary } from "../state/tableStore";

interface LobbyPageProps {
  store?: TableStore;
}

export function LobbyPage({ store = tableStore }: LobbyPageProps) {
  const [tables, setTables] = useState<TableSummary[]>(store.getState().tables);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const loadTables = async () => {
    setStatus("loading");
    try {
      await store.fetchTables();
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load lobby";
      setError(message);
    } finally {
      setStatus("idle");
    }
  };

  useEffect(() => {
    const unsubscribe = store.subscribe((next) => setTables(next.tables));
    loadTables();
    store.subscribeLobby();
    return () => unsubscribe();
  }, [store]);

  useEffect(() => {
    fetchProfile()
      .then((data) => setProfile(data))
      .catch((err: Error) => {
        console.warn("profile.fetch.failed", { message: err.message });
      });
  }, []);

  useEffect(() => {
    const tracer = trace.getTracer("ui");
    const span = tracer.startSpan("ui.lobby.render", {
      attributes: {
        "poker.lobby_count": tables.length,
      },
    });
    span.end();
  }, [tables.length]);

  const handleCreate = async (input: Parameters<typeof createTable>[0]) => {
    try {
      await createTable(input);
      const tracer = trace.getTracer("ui");
      const span = tracer.startSpan("ui.table.create_submit");
      span.end();
      await loadTables();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Create table failed";
      setError(message);
    }
  };

  const joinSeat = async (tableId: string, seatId: number) => {
    try {
      await store.joinSeat(tableId, seatId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to join seat";
      setError(message);
    }
  };

  const tableRows = tables.map((table, index) => {
    const occupied = new Set(table.occupiedSeatIds ?? []);
    const seatButtons = Array.from({ length: table.config.maxPlayers }, (_, index) => {
      const isTaken = occupied.has(index);
      return (
        <button
          key={`${table.tableId}-seat-${index}`}
          type="button"
          className="btn btn-seat"
          onClick={() => joinSeat(table.tableId, index)}
          disabled={isTaken}
        >
          {isTaken ? `Seat ${index + 1} Taken` : `Join Seat ${index + 1}`}
        </button>
      );
    });
    return (
      <div
        key={table.tableId}
        className="card table-card stagger-item"
        style={{ "--stagger": index } as React.CSSProperties}
      >
        <div className="table-card-header">
          <div>
            <div className="table-name">{table.name}</div>
            <div className="meta-line">
              Blinds {table.config.smallBlind}/{table.config.bigBlind}
            </div>
          </div>
          <div className={`status-pill ${table.inProgress ? "live" : "waiting"}`}>
            {table.inProgress ? "In Hand" : "Open Lobby"}
          </div>
        </div>
        <div className="table-meta">
          <div>
            Seats: {table.seatsTaken}/{table.config.maxPlayers}
          </div>
          <div>Starting Stack: {table.config.startingStack}</div>
        </div>
        <div className="seat-actions">{seatButtons}</div>
      </div>
    );
  });

  const profileInitials = profile ? profile.nickname.slice(0, 2).toUpperCase() : "";

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Lobby</h2>
          <p>Pick a seat, or set up a new table with your preferred blinds.</p>
          <div className="meta-line">Live updates run every 2 seconds.</div>
        </div>
        <PokerArt variant="hero" />
      </div>
      <div className="table-grid">
        <CreateTableForm onCreate={handleCreate} />
        {profile ? (
          <div className="card profile-panel">
            <h3>Your Profile</h3>
            <div className="profile-summary">
              <div className="avatar">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={`${profile.nickname} avatar`} />
                ) : (
                  <span>{profileInitials}</span>
                )}
              </div>
              <div>
                <div className="meta-line">Nickname</div>
                <div className="table-name">{profile.nickname}</div>
              </div>
            </div>
            <div className="stat-grid">
              <div className="stat">
                <strong>{profile.stats.handsPlayed}</strong>
                Hands Played
              </div>
              <div className="stat">
                <strong>{profile.stats.wins}</strong>
                Wins
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="table-list">
        {status === "loading" ? <div className="meta-line">Loading tables...</div> : null}
        {tableRows.length === 0 ? <div className="meta-line">No tables yet.</div> : tableRows}
      </div>
      {error ? (
        <div role="alert" className="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
