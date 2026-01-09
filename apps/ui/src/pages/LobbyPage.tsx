import React, { useEffect, useState } from "react";
import { trace } from "@opentelemetry/api";

import { CreateTableForm } from "../components/CreateTableForm";
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

  const tableRows = tables.map((table) => {
    const seatButtons = Array.from({ length: table.config.maxPlayers }, (_, index) => (
      <button
        key={`${table.tableId}-seat-${index}`}
        type="button"
        onClick={() => joinSeat(table.tableId, index)}
      >
        Join Seat {index + 1}
      </button>
    ));
    return (
      <div key={table.tableId}>
        <div>{table.name}</div>
        <div>
          Blinds: {table.config.smallBlind}/{table.config.bigBlind}
        </div>
        <div>
          {table.seatsTaken}/{table.config.maxPlayers} seats
        </div>
        <div>Status: {table.inProgress ? "In Hand" : "Lobby"}</div>
        <div>{seatButtons}</div>
      </div>
    );
  });

  return (
    <section>
      <h2>Lobby</h2>
      <CreateTableForm onCreate={handleCreate} />
      <div>
        {status === "loading" ? <div>Loading tables...</div> : null}
        {tableRows.length === 0 ? <div>No tables yet.</div> : tableRows}
      </div>
      {error ? <div role="alert">{error}</div> : null}
    </section>
  );
}
