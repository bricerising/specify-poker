import React, { useEffect, useState } from "react";

const CHAT_COLLAPSED_STORAGE_KEY = "poker.ui.chat.collapsed";

export interface ChatMessage {
  id: string;
  userId: string;
  nickname?: string;
  text: string;
  ts: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  error?: string | null;
  onCollapseChange?: (collapsed: boolean) => void;
}

export function ChatPanel({ messages, onSend, error, onCollapseChange }: ChatPanelProps) {
  const [message, setMessage] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return window.localStorage.getItem(CHAT_COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_COLLAPSED_STORAGE_KEY, isCollapsed ? "1" : "0");
    } catch {
      // ignore persistence failures
    }
    onCollapseChange?.(isCollapsed);
  }, [isCollapsed, onCollapseChange]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    onSend(trimmed);
    setMessage("");
  };

  return (
    <section className={`card chat-panel${isCollapsed ? " chat-panel-collapsed" : ""}`}>
      <header className="chat-panel-header">
        <h3>Table Chat</h3>
        <button
          type="button"
          className="btn btn-ghost btn-chat-toggle"
          onClick={() => setIsCollapsed((current) => !current)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand chat" : "Collapse chat"}
        >
          {isCollapsed ? "Expand" : "Collapse"}
          <span className="chat-panel-count" aria-hidden="true">
            {messages.length}
          </span>
        </button>
      </header>

      {isCollapsed ? null : (
        <>
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="meta-line">No messages yet.</div>
            ) : (
              messages.map((entry) => (
                <div key={entry.id} className="chat-message">
                  <strong>{entry.nickname ?? entry.userId}</strong>: {entry.text}
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSubmit} className="form-grid">
            <label className="field">
              <span className="field-label">Message</span>
              <input value={message} onChange={(event) => setMessage(event.target.value)} />
            </label>
            <div className="field">
              <span className="field-label">&nbsp;</span>
              <button type="submit" className="btn btn-primary">
                Send
              </button>
            </div>
          </form>
          {error ? (
            <div role="alert" className="alert">
              {error}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
