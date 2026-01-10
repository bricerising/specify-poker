type LobbyListener = () => void;

const listeners = new Set<LobbyListener>();

export function onLobbyUpdate(listener: LobbyListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitLobbyUpdate() {
  for (const listener of listeners) {
    listener();
  }
}
