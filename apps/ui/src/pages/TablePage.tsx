import React, { useEffect, useMemo, useState } from "react";
import { trace } from "@opentelemetry/api";

import { ActionBar } from "../components/ActionBar";
import { ChatPanel } from "../components/ChatPanel";
import { ModerationMenu } from "../components/ModerationMenu";
import { deriveLegalActions } from "../state/deriveLegalActions";
import { TableStore, tableStore } from "../state/tableStore";
import { fetchCurrentProfile } from "../services/auth";

interface TablePageProps {
  store?: TableStore;
}

export function TablePage({ store = tableStore }: TablePageProps) {
  const [state, setState] = useState(store.getState());
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => store.subscribe(setState), [store]);

  useEffect(() => {
    fetchCurrentProfile()
      .then((profile: { userId?: string }) => {
        setUserId(profile.userId ?? null);
      })
      .catch((error: Error) => {
        console.warn("profile.fetch.failed", { message: error.message });
      });
  }, []);

  useEffect(() => {
    if (state.tableState) {
      const tracer = trace.getTracer("ui");
      const span = tracer.startSpan("ui.table.render", {
        attributes: {
          "poker.table_id": state.tableState.tableId,
          "poker.table_version": state.tableState.version,
        },
      });
      span.end();
    }
  }, [state.tableState]);

  useEffect(() => {
    if (state.tableState) {
      store.subscribeChat(state.tableState.tableId);
    }
  }, [state.tableState?.tableId, store]);

  const actions = useMemo(() => {
    if (!state.tableState || state.seatId === null) {
      return [];
    }
    return deriveLegalActions(state.tableState, state.seatId);
  }, [state.tableState, state.seatId]);

  if (!state.tableState) {
    return <div>Select a table from the lobby.</div>;
  }

  const hand = state.tableState.hand;
  const pot = hand?.pots.reduce((sum, entry) => sum + entry.amount, 0) ?? 0;

  return (
    <div>
      <h2>{state.tableState.name}</h2>
      <div>Table ID: {state.tableState.tableId}</div>
      <div>Pot: {pot}</div>
      <div>Board: {hand?.communityCards.join(" ") ?? "Waiting"}</div>
      <div>Street: {hand?.currentStreet ?? "lobby"}</div>
      <div>Current Turn: {hand?.currentTurnSeat ?? "-"}</div>
      <div>
        {state.tableState.seats.map((seat) => (
          <div key={seat.seatId}>
            Seat {seat.seatId + 1}: {seat.userId ?? "Empty"} (stack {seat.stack}) [{seat.status}]
          </div>
        ))}
      </div>
      <ActionBar actions={actions} onAction={(action) => store.sendAction(action)} />
      <ChatPanel
        messages={state.chatMessages}
        onSend={(message) => store.sendChat(message)}
        error={state.chatError}
      />
      {userId && state.tableState.ownerId === userId ? (
        <ModerationMenu tableId={state.tableState.tableId} seats={state.tableState.seats} />
      ) : null}
    </div>
  );
}
