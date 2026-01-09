import React, { useEffect, useState } from "react";

import { fetchFriends, updateFriends } from "../services/friendsApi";

export function FriendsPage() {
  const [friends, setFriends] = useState<string[]>([]);
  const [newFriend, setNewFriend] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadFriends = async () => {
    try {
      const next = await fetchFriends();
      setFriends(next);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load friends";
      setError(message);
    }
  };

  useEffect(() => {
    loadFriends();
  }, []);

  const persistFriends = async (next: string[]) => {
    try {
      const updated = await updateFriends(next);
      setFriends(updated);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update friends";
      setError(message);
    }
  };

  const handleAdd = async () => {
    const trimmed = newFriend.trim();
    if (!trimmed) {
      return;
    }
    setNewFriend("");
    await persistFriends([...friends, trimmed]);
  };

  const handleRemove = async (friend: string) => {
    await persistFriends(friends.filter((entry) => entry !== friend));
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Friends</h2>
          <p>Keep trusted opponents close so new tables fill up faster.</p>
        </div>
      </div>
      <div className="card friends-panel">
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Add Friend</span>
            <input
              value={newFriend}
              onChange={(event) => setNewFriend(event.target.value)}
              placeholder="Enter a player name"
            />
          </label>
          <div className="field">
            <span className="field-label">&nbsp;</span>
            <button type="button" className="btn btn-primary" onClick={handleAdd}>
              Add
            </button>
          </div>
        </div>
        <div className="friends-list">
          {friends.length === 0 ? (
            <div className="meta-line">No friends yet.</div>
          ) : (
            friends.map((friend) => (
              <div key={friend} className="friend-row">
                <div>{friend}</div>
                <button type="button" className="btn btn-quiet" onClick={() => handleRemove(friend)}>
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      {error ? (
        <div role="alert" className="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
