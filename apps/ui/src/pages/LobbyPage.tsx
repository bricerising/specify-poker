import React, { useEffect, useState } from "react";
import { trace } from "@opentelemetry/api";

import { CreateTableForm } from "../components/CreateTableForm";
import { PokerArt } from "../components/PokerArt";
import { createTable, listTables } from "../services/lobbyApi";
import { TableStore, tableStore, TableSummary } from "../state/tableStore";

interface LobbyPageProps {
  store?: TableStore;
}

export function LobbyPage({ store = tableStore }: LobbyPageProps) {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const loadTables = async () => {
    setStatus("loading");
    try {
      const next = await listTables();
      setTables(next);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load lobby";
      setError(message);
    } finally {
      setStatus("idle");
    }
  };

  useEffect(() => {
    loadTables();
    const interval = window.setInterval(loadTables, 2000);
    return () => window.clearInterval(interval);
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
    const seatButtons = Array.from({ length: table.config.maxPlayers }, (_, index) => (
      <button
        key={`${table.tableId}-seat-${index}`}
        type="button"
        className="btn btn-seat"
        onClick={() => joinSeat(table.tableId, index)}
      >
        Join Seat {index + 1}
      </button>
    ));
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
      <CreateTableForm onCreate={handleCreate} />
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
