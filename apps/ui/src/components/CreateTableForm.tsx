import React, { useMemo, useState } from "react";

import { CreateTableInput } from "../services/lobbyApi";

interface CreateTableFormProps {
  onCreate: (input: CreateTableInput) => Promise<void> | void;
}

export function CreateTableForm({ onCreate }: CreateTableFormProps) {
  const [name, setName] = useState("");
  const [smallBlind, setSmallBlind] = useState("5");
  const [bigBlind, setBigBlind] = useState("10");
  const [maxPlayers, setMaxPlayers] = useState("6");
  const [startingStack, setStartingStack] = useState("500");
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    return {
      smallBlind: Number(smallBlind),
      bigBlind: Number(bigBlind),
      maxPlayers: Number(maxPlayers),
      startingStack: Number(startingStack),
    };
  }, [smallBlind, bigBlind, maxPlayers, startingStack]);

  const isValid = useMemo(() => {
    if (!name.trim()) {
      return false;
    }
    if (!Number.isFinite(parsed.smallBlind) || parsed.smallBlind <= 0) {
      return false;
    }
    if (!Number.isFinite(parsed.bigBlind) || parsed.bigBlind < parsed.smallBlind * 2) {
      return false;
    }
    if (!Number.isInteger(parsed.maxPlayers) || parsed.maxPlayers < 2 || parsed.maxPlayers > 9) {
      return false;
    }
    if (!Number.isFinite(parsed.startingStack) || parsed.startingStack <= 0) {
      return false;
    }
    return true;
  }, [name, parsed]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) {
      setError("Please enter valid table settings.");
      return;
    }
    setError(null);
    await onCreate({
      name: name.trim(),
      smallBlind: parsed.smallBlind,
      bigBlind: parsed.bigBlind,
      maxPlayers: parsed.maxPlayers,
      startingStack: parsed.startingStack,
    });
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3>Create Table</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Friday Night No Limit"
          />
        </label>
        <label className="field">
          <span className="field-label">Small Blind</span>
          <input
            type="number"
            min={1}
            value={smallBlind}
            onChange={(event) => setSmallBlind(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Big Blind</span>
          <input
            type="number"
            min={1}
            value={bigBlind}
            onChange={(event) => setBigBlind(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Max Players</span>
          <input
            type="number"
            min={2}
            max={9}
            value={maxPlayers}
            onChange={(event) => setMaxPlayers(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Starting Stack</span>
          <input
            type="number"
            min={1}
            value={startingStack}
            onChange={(event) => setStartingStack(event.target.value)}
          />
        </label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={!isValid}>
        Create Table
      </button>
      {error ? (
        <div role="alert" className="alert">
          {error}
        </div>
      ) : null}
    </form>
  );
}
