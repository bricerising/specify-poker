import React, { useEffect, useState } from "react";
import { trace } from "@opentelemetry/api";

import { CreateTableForm } from "../components/CreateTableForm";
import { PokerArt } from "../components/PokerArt";
import { createTable } from "../services/lobbyApi";
import { fetchProfile, UserProfile } from "../services/profileApi";
import { TableStore, tableStore, TableSummary } from "../state/tableStore";
import { testIds } from "../utils/testIds";

interface LobbyPageProps {
  store?: TableStore;
}

export function LobbyPage({ store = tableStore }: LobbyPageProps) {
  const [tables, setTables] = useState<TableSummary[]>(store.getState().tables);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "copied" | "failed">("idle");

  const instanceUrl = typeof window === "undefined" ? null : window.location.origin;

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

  const spectateTable = (tableId: string) => {
    store.spectateTable(tableId);
  };

  const handleCopyInvite = async () => {
    if (!instanceUrl) {
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(instanceUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = instanceUrl;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setInviteStatus("copied");
    } catch {
      setInviteStatus("failed");
    } finally {
      window.setTimeout(() => setInviteStatus("idle"), 2_000);
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
          data-testid={testIds.lobby.joinSeat}
          data-table-id={table.tableId}
          data-seat-id={index}
          data-seat-number={index + 1}
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
        data-testid={testIds.lobby.tableCard}
        data-table-id={table.tableId}
      >
        <div className="table-card-header">
          <div>
            <div className="table-name">{table.name}</div>
            <div className="meta-line">
              Blinds {table.config.smallBlind}/{table.config.bigBlind}
            </div>
          </div>
          <div className={`status-pill ${table.inProgress ? "live" : "waiting"}`}>
            {table.inProgress ? "In Hand" : "Waiting"}
          </div>
        </div>
        <div className="table-meta">
          <div>
            Seats: {table.seatsTaken}/{table.config.maxPlayers}
            {table.spectatorCount ? ` | ${table.spectatorCount} watching` : ""}
          </div>
          <div>Starting Stack: {table.config.startingStack}</div>
        </div>
        <div className="seat-actions">
          {seatButtons}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => spectateTable(table.tableId)}
            data-testid={testIds.lobby.watchTable}
            data-table-id={table.tableId}
          >
            Watch
          </button>
        </div>
      </div>
    );
  });

  const profileInitials = profile ? profile.username.slice(0, 2).toUpperCase() : "";

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Lobby</h2>
          <p>Create a table for your group, or grab an open seat.</p>
          <div className="meta-line">This lobby is scoped to your private instance.</div>
        </div>
        <PokerArt variant="hero" />
      </div>
      <div className="table-grid">
        <CreateTableForm onCreate={handleCreate} />
        <div className="card invite-panel">
          <h3>Invite Friends</h3>
          <p className="meta-line">Share this lobby link with friends so they can sign in and join.</p>
          <div className="seat-actions">
            <a
              className="invite-url"
              href={instanceUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              data-testid={testIds.lobby.inviteLink}
            >
              {instanceUrl ?? "Invite link available in browser"}
            </a>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={handleCopyInvite}
              disabled={!instanceUrl || inviteStatus === "copied"}
              data-testid={testIds.lobby.copyInvite}
            >
              {inviteStatus === "copied" ? "Copied" : inviteStatus === "failed" ? "Copy failed" : "Copy"}
            </button>
          </div>
        </div>
        {profile ? (
          <div className="card profile-panel">
            <h3>Your Profile</h3>
            <div className="profile-summary">
              <div className="avatar">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={`${profile.username} avatar`} />
                ) : (
                  <span>{profileInitials}</span>
                )}
              </div>
              <div>
                <div className="meta-line">Username</div>
                <div className="table-name">{profile.username}</div>
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
        {tableRows.length === 0 ? (
          <div className="meta-line">No tables yet. Create one to start a private game.</div>
        ) : (
          tableRows
        )}
      </div>
      {error ? (
        <div role="alert" className="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
