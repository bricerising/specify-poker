import React, { useState } from "react";

export interface ChatMessage {
  id: string;
  userId: string;
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
    <section>
      <h3>Table Chat</h3>
      <div>
        {messages.length === 0 ? (
          <div>No messages yet.</div>
        ) : (
          messages.map((entry) => (
            <div key={entry.id}>
              <strong>{entry.userId}</strong>: {entry.text}
            </div>
          ))
        )}
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          Message
          <input value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <button type="submit">Send</button>
      </form>
      {error ? <div role="alert">{error}</div> : null}
    </section>
  );
}
