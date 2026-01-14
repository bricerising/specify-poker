import React from "react";
import { createRoot } from "react-dom/client";

import { LobbyPage } from "./pages/LobbyPage";
import { TablePage } from "./pages/TablePage";
import { ProfilePage } from "./pages/ProfilePage";
import { FriendsPage } from "./pages/FriendsPage";
import { PokerArt } from "./components/PokerArt";
import { initUiTelemetry, recordNavigation } from "./observability/otel";
import { clearToken, hydrateTokenFromCallback, isAuthenticated, startLogin } from "./services/auth";
import { ensurePushSubscription } from "./services/pushManager";
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

  React.useEffect(() => {
    ensurePushSubscription().catch((error: Error) => {
      console.warn("push.subscribe.failed", { message: error.message });
    });
  }, []);

  const handleClearToken = () => {
    clearToken();
    window.location.reload();
  };

  const header = (
    <header className="app-header">
      <div className="brand">
        <div className="brand-title">Specify Poker</div>
        <div className="brand-subtitle">Private Texas Hold’em games with friends.</div>
      </div>
      <div className="header-actions">
        <div className="user-badge">
          <div className="user-label">Signed in</div>
          <div className="user-value">{profile ? profile.nickname : "Player"}</div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={handleClearToken}>
          Sign out
        </button>
      </div>
    </header>
  );

  if (state.tableState) {
    return (
      <div className="app-shell">
        {header}
        <div className="content">
          <TablePage store={tableStore} />
        </div>
      </div>
    );
  }

  const navClass = (target: "lobby" | "profile" | "friends") =>
    `nav-button${view === target ? " active" : ""}`;

  return (
    <div className="app-shell">
      {header}
      <nav className="app-nav">
        <button type="button" className={navClass("lobby")} onClick={() => setView("lobby")}>
          Lobby
        </button>
        <button type="button" className={navClass("profile")} onClick={() => setView("profile")}>
          Profile
        </button>
        <button type="button" className={navClass("friends")} onClick={() => setView("friends")}>
          Friends
        </button>
      </nav>
      <div className="content">
        {view === "lobby" ? <LobbyPage store={tableStore} /> : null}
        {view === "profile" ? <ProfilePage onProfileUpdated={setProfile} /> : null}
        {view === "friends" ? <FriendsPage /> : null}
      </div>
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
    <div className="app-root">
      {authStatus === "checking" ? (
        <div className="app-shell">
          <header className="app-header">
            <div className="brand">
              <div className="brand-title">Specify Poker</div>
              <div className="brand-subtitle">Secure login for your private game.</div>
            </div>
          </header>
          <div className="card card-subtle">Signing in...</div>
        </div>
      ) : authStatus === "authed" ? (
        <PokerApp />
      ) : (
        <div className="app-shell">
          <header className="app-header">
            <div className="brand">
              <div className="brand-title">Specify Poker</div>
              <div className="brand-subtitle">Private Texas Hold’em games with friends.</div>
            </div>
          </header>
          <div className="card login-card">
            <div className="login-hero">
              <div>
                <h1>Specify Poker</h1>
                <p>
                  Host private Texas Hold’em games with friends: create tables, chat in real time,
                  spectate hands, and get a nudge when it’s your turn.
                </p>
                <div className="login-actions">
                  <a
                    className="btn btn-primary"
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      void startLogin(window.location.origin);
                    }}
                  >
                    Login
                  </a>
                  <p className="meta-line">Secure login via Keycloak OIDC.</p>
                </div>
              </div>
              <PokerArt variant="hero" />
            </div>
          </div>
          <div className="table-grid">
            <div className="card card-subtle">
              <h3>Private Lobby</h3>
              <p>Tables are scoped to your instance. Share the lobby link and play with friends.</p>
            </div>
            <div className="card card-subtle">
              <h3>Real-Time Play</h3>
              <p>Seats, actions, pots, and chat stay in sync via WebSockets.</p>
            </div>
            <div className="card card-subtle">
              <h3>Friends & Alerts</h3>
              <p>Keep a friends list and enable push alerts so you never miss your turn.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

root.render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
);
