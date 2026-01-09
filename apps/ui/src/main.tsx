import React from "react";
import { createRoot } from "react-dom/client";

import { LobbyPage } from "./pages/LobbyPage";
import { TablePage } from "./pages/TablePage";
import { ProfilePage } from "./pages/ProfilePage";
import { FriendsPage } from "./pages/FriendsPage";
import { initUiTelemetry, recordNavigation } from "./observability/otel";
import { hydrateTokenFromCallback, isAuthenticated, startLogin } from "./services/auth";
import { tableStore } from "./state/tableStore";
import { fetchProfile, UserProfile } from "./services/profileApi";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

initUiTelemetry();
recordNavigation(window.location.pathname);

const root = createRoot(rootElement);

function PokerApp() {
  const [state, setState] = React.useState(tableStore.getState());
  const [view, setView] = React.useState<"lobby" | "profile" | "friends">("lobby");
  const [profile, setProfile] = React.useState<UserProfile | null>(null);

  React.useEffect(() => tableStore.subscribe(setState), []);
  React.useEffect(() => {
    fetchProfile()
      .then((data) => setProfile(data))
      .catch((error: Error) => {
        console.warn("profile.fetch.failed", { message: error.message });
      });
  }, []);

  const header = profile ? <div>Signed in as {profile.nickname}</div> : null;

  if (state.tableState) {
    return (
      <div>
        {header}
        <TablePage store={tableStore} />
      </div>
    );
  }

  return (
    <div>
      {header}
      <nav>
        <button type="button" onClick={() => setView("lobby")}>
          Lobby
        </button>
        <button type="button" onClick={() => setView("profile")}>
          Profile
        </button>
        <button type="button" onClick={() => setView("friends")}>
          Friends
        </button>
      </nav>
      {view === "lobby" ? <LobbyPage store={tableStore} /> : null}
      {view === "profile" ? <ProfilePage onProfileUpdated={setProfile} /> : null}
      {view === "friends" ? <FriendsPage /> : null}
    </div>
  );
}

function AppRoot() {
  const hasAuthCode = new URLSearchParams(window.location.search).has("code");
  const [authStatus, setAuthStatus] = React.useState<"checking" | "authed" | "anon">(() => {
    if (hasAuthCode) {
      return "checking";
    }
    return isAuthenticated() ? "authed" : "anon";
  });

  React.useEffect(() => {
    if (authStatus !== "checking") {
      return;
    }
    hydrateTokenFromCallback()
      .then(() => {
        setAuthStatus(isAuthenticated() ? "authed" : "anon");
      })
      .catch((error: Error) => {
        console.warn("auth.callback.failed", { message: error.message });
        setAuthStatus("anon");
      });
  }, [authStatus]);

  return (
    <div>
      <h1>Specify Poker MVP</h1>
      {authStatus === "checking" ? (
        <div>Signing in...</div>
      ) : authStatus === "authed" ? (
        <PokerApp />
      ) : (
        <button type="button" onClick={() => startLogin(window.location.origin)}>
          Login
        </button>
      )}
    </div>
  );
}

root.render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
);
