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
    <section>
      <h2>Friends</h2>
      <div>
        <label>
          Add Friend
          <input
            value={newFriend}
            onChange={(event) => setNewFriend(event.target.value)}
          />
        </label>
        <button type="button" onClick={handleAdd}>
          Add
        </button>
      </div>
      <div>
        {friends.length === 0 ? (
          <div>No friends yet.</div>
        ) : (
          friends.map((friend) => (
            <div key={friend}>
              {friend}
              <button type="button" onClick={() => handleRemove(friend)}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>
      {error ? <div role="alert">{error}</div> : null}
    </section>
  );
}
