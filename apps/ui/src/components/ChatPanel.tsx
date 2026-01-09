import React, { useState } from "react";

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
}

export function ChatPanel({ messages, onSend, error }: ChatPanelProps) {
  const [message, setMessage] = useState("");

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
    <section className="card chat-panel">
      <h3>Table Chat</h3>
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
    </section>
  );
}
