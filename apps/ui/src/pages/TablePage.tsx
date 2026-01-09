import React, { useEffect, useMemo, useState } from "react";
import { trace } from "@opentelemetry/api";

import { ActionBar } from "../components/ActionBar";
import { ChatPanel } from "../components/ChatPanel";
import { ModerationMenu } from "../components/ModerationMenu";
import { PokerArt } from "../components/PokerArt";
import { deriveLegalActions } from "../state/deriveLegalActions";
import { TableStore, tableStore } from "../state/tableStore";
import { fetchProfile } from "../services/profileApi";

interface TablePageProps {
  store?: TableStore;
}

export function TablePage({ store = tableStore }: TablePageProps) {
  const [state, setState] = useState(store.getState());
  const [userId, setUserId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => store.subscribe(setState), [store]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchProfile()
      .then((profile) => {
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
  const communityCards = hand?.communityCards ?? [];
  const privateCards = state.privateHoleCards ?? [];
  const deadline = hand?.actionTimerDeadline ? Date.parse(hand.actionTimerDeadline) : null;
  const remainingMs = deadline ? Math.max(0, deadline - now) : null;
  const remainingSeconds = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;
  const minutes = remainingSeconds !== null ? Math.floor(remainingSeconds / 60) : null;
  const seconds = remainingSeconds !== null ? remainingSeconds % 60 : null;
  const countdown =
    minutes !== null && seconds !== null ? `${minutes}:${String(seconds).padStart(2, "0")}` : null;

  const renderCards = (cards: string[], fallback: string) => {
    if (cards.length === 0) {
      return <span className="card-ghost">{fallback}</span>;
    }
    return cards.map((card, index) => (
      <span key={`${card}-${index}`} className="playing-card">
        {card}
      </span>
    ));
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>{state.tableState.name}</h2>
          <p>Track the hand flow and take your action when it is your turn.</p>
          <div className="meta-line">Table ID: {state.tableState.tableId}</div>
        </div>
        <PokerArt variant="table" />
      </div>
      <div className="table-grid">
        <div className="card table-facts">
          <div className="fact">
            <span>Pot</span>
            <strong>{pot}</strong>
          </div>
          <div className="fact">
            <span>Street</span>
            <strong>{hand?.currentStreet ?? "Lobby"}</strong>
          </div>
          <div className="fact">
            <span>Current Turn</span>
            <strong>
              {hand?.currentTurnSeat !== undefined ? `Seat ${hand.currentTurnSeat + 1}` : "-"}
            </strong>
          </div>
          {countdown ? (
            <div className="timer-pill">
              <span>Action Timer</span>
              <strong>{remainingSeconds === 0 ? "Acting now" : countdown}</strong>
            </div>
          ) : null}
          <div>
            <div className="meta-line">Board</div>
            <div className="card-row">{renderCards(communityCards, "Waiting")}</div>
          </div>
          <div>
            <div className="meta-line">Your Cards</div>
            <div className="card-row">{renderCards(privateCards, "Hidden")}</div>
          </div>
        </div>
        <div className="card">
          <h3>Seats</h3>
          <div className="seat-grid">
            {state.tableState.seats.map((seat) => (
              <div
                key={seat.seatId}
                className={`seat-card${seat.seatId === state.seatId ? " is-you" : ""}`}
              >
                <strong>Seat {seat.seatId + 1}</strong>
                <div>{seat.nickname ?? seat.userId ?? "Open seat"}</div>
                <div>Stack: {seat.stack}</div>
                <div>Status: {seat.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="table-actions">
        <ActionBar actions={actions} onAction={(action) => store.sendAction(action)} />
        <ChatPanel
          messages={state.chatMessages}
          onSend={(message) => store.sendChat(message)}
          error={state.chatError}
        />
      </div>
      {userId && state.tableState.ownerId === userId ? (
        <ModerationMenu tableId={state.tableState.tableId} seats={state.tableState.seats} />
      ) : null}
    </section>
  );
}
