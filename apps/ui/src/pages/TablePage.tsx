import React, { useEffect, useMemo, useState } from 'react';
import { trace } from '@opentelemetry/api';

import { ActionBar } from '../components/ActionBar';
import { ChatPanel } from '../components/ChatPanel';
import { ModerationMenu } from '../components/ModerationMenu';
import { PlayingCard } from '../components/PlayingCard';
import { TableLayout } from '../components/TableLayout';
import { Timer } from '../components/Timer';
import { deriveLegalActions } from '../state/deriveLegalActions';
import type { TableStore } from '../state/tableStore';
import { tableStore } from '../state/tableStore';
import type { UserProfile } from '../services/profileApi';
import { fetchProfile } from '../services/profileApi';
import { recordAction } from '../observability/otel';
import { formatBlinds } from '../utils/chipFormatter';
import { testIds } from '../utils/testIds';

interface TablePageProps {
  store?: TableStore;
  onLeave?: () => void;
}

export function TablePage({ store = tableStore, onLeave }: TablePageProps) {
  const [state, setState] = useState(store.getState());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  useEffect(() => store.subscribe(setState), [store]);

  useEffect(() => {
    fetchProfile()
      .then((data) => {
        setProfile(data);
      })
      .catch((error: Error) => {
        console.warn('profile.fetch.failed', { message: error.message });
      });
  }, []);

  useEffect(() => {
    if (state.tableState) {
      const tracer = trace.getTracer('ui');
      const span = tracer.startSpan('ui.table.render', {
        attributes: {
          'poker.table_id': state.tableState.tableId,
          'poker.table_version': state.tableState.version,
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
  const spectatorCount = state.tableState.spectators?.length ?? 0;
  const blinds = formatBlinds(state.tableState.config.smallBlind, state.tableState.config.bigBlind);

  const handleLeaveTable = () => {
    recordAction('leave_table', { 'poker.table_id': state.tableState?.tableId ?? '' });
    store.leaveTable();
    onLeave?.();
  };

  const userId = profile?.userId ?? null;
  const showModeration = Boolean(userId && state.tableState.ownerId === userId);

  return (
    <section className="table-page">
      <header className="table-topbar">
        <div>
          <h2>{state.tableState.name}</h2>
          <div className="meta-line">
            Table ID: {state.tableState.tableId} | Blinds {blinds}
            {spectatorCount > 0
              ? ` | ${spectatorCount} spectator${spectatorCount !== 1 ? 's' : ''}`
              : ''}
          </div>
        </div>
        <div className="table-topbar-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleLeaveTable}
            data-testid={testIds.table.leave}
          >
            Leave Table
          </button>
        </div>
      </header>

      <div className="table-play-area">
        <div className="table-stage">
          <TableLayout
            seats={state.tableState.seats}
            currentUserSeatId={state.seatId}
            currentTurnSeatId={hand?.currentTurnSeat ?? null}
            buttonSeatId={state.tableState.button}
            privateCards={state.privateHoleCards}
          >
            <div className="table-center-stack">
              <div className="table-facts table-facts-top">
                <div className="fact pot-pill">
                  <span>Pot</span>
                  <strong>{pot}</strong>
                </div>
              </div>
              <div className="board-row">
                {communityCards.length > 0 ? (
                  communityCards.map((card, index) => (
                    <PlayingCard key={`${card}-${index}`} card={card} size="lg" />
                  ))
                ) : (
                  <span className="card-ghost">Waiting</span>
                )}
              </div>
              <div className="table-facts">
                <div className="fact">
                  <span>Street</span>
                  <strong>{hand?.currentStreet ?? 'Waiting'}</strong>
                </div>
                <div className="fact">
                  <span>Current Turn</span>
                  <strong>
                    {hand?.currentTurnSeat !== undefined ? `Seat ${hand.currentTurnSeat + 1}` : '-'}
                  </strong>
                </div>
              </div>
              <Timer deadlineTs={hand?.actionTimerDeadline ?? null} />
            </div>
          </TableLayout>
        </div>

        <div className={`table-dock${showModeration ? ' table-dock-with-side' : ''}`}>
          <div className="table-dock-main">
            <ActionBar
              actions={actions}
              pot={pot}
              onAction={(action) => store.sendAction(action)}
            />
          </div>
          {showModeration ? (
            <div className="table-dock-side">
              <ModerationMenu tableId={state.tableState.tableId} seats={state.tableState.seats} />
            </div>
          ) : null}
        </div>

        <div className={`table-chat-dock${isChatCollapsed ? ' is-collapsed' : ''}`}>
          <ChatPanel
            messages={state.chatMessages}
            onSend={(message) => store.sendChat(message)}
            error={state.chatError}
            onCollapseChange={setIsChatCollapsed}
          />
        </div>
      </div>
    </section>
  );
}
