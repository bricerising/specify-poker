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

type AppRoute =
  | { kind: "lobby" }
  | { kind: "profile" }
  | { kind: "friends" }
  | { kind: "table"; tableId: string };

function normalizePathname(pathname: string) {
  const trimmed = pathname.trim().replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "/";
}

function parseRoute(pathname: string): AppRoute {
  const normalized = normalizePathname(pathname);
  const tableMatch = normalized.match(/^\/table\/([^/]+)$/);
  if (tableMatch) {
    return { kind: "table", tableId: decodeURIComponent(tableMatch[1]) };
  }
  if (normalized === "/profile") {
    return { kind: "profile" };
  }
  if (normalized === "/friends") {
    return { kind: "friends" };
  }
  return { kind: "lobby" };
}

function buildTablePath(tableId: string) {
  return `/table/${encodeURIComponent(tableId)}`;
}

function PokerApp() {
  const [state, setState] = React.useState(tableStore.getState());
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [pathname, setPathname] = React.useState(() => normalizePathname(window.location.pathname));
  const route = React.useMemo(() => parseRoute(pathname), [pathname]);
  const tableRouteId = route.kind === "table" ? route.tableId : null;
  const previousTableIdRef = React.useRef<string | null>(null);

  React.useEffect(() => tableStore.subscribe(setState), []);
  React.useEffect(() => {
    const handler = () => {
      const nextPath = normalizePathname(window.location.pathname);
      setPathname(nextPath);
      recordNavigation(nextPath);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const navigate = React.useCallback((nextPath: string) => {
    const normalized = normalizePathname(nextPath);
    if (normalized === window.location.pathname) {
      return;
    }
    window.history.pushState(null, "", normalized);
    setPathname(normalized);
    recordNavigation(normalized);
  }, []);

  React.useEffect(() => {
    if (!tableRouteId) {
      return;
    }
    const currentTableId = tableStore.getState().tableState?.tableId ?? null;
    if (currentTableId === tableRouteId) {
      return;
    }
    if (currentTableId) {
      tableStore.leaveTable();
    }
    tableStore.spectateTable(tableRouteId);
  }, [tableRouteId]);

  React.useEffect(() => {
    if (route.kind === "table") {
      return;
    }
    if (state.tableState) {
      tableStore.leaveTable();
    }
  }, [route.kind]);

  React.useEffect(() => {
    const currentTableId = state.tableState?.tableId ?? null;
    const previousTableId = previousTableIdRef.current;
    previousTableIdRef.current = currentTableId;

    if (route.kind === "table" && previousTableId && !currentTableId) {
      navigate("/");
      return;
    }

    if (route.kind !== "table" && currentTableId && !previousTableId) {
      navigate(buildTablePath(currentTableId));
    }
  }, [navigate, route.kind, state.tableState?.tableId]);

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

  if (route.kind === "table" || state.tableState) {
    return (
      <div className="app-shell app-shell-table">
        {header}
        <div className="content">
          <TablePage store={tableStore} onLeave={() => navigate("/")} />
        </div>
      </div>
    );
  }

  const view = route.kind;
  const navClass = (target: "lobby" | "profile" | "friends") => `nav-button${view === target ? " active" : ""}`;

  return (
    <div className="app-shell">
      {header}
      <nav className="app-nav">
        <button type="button" className={navClass("lobby")} onClick={() => navigate("/")}>
          Lobby
        </button>
        <button type="button" className={navClass("profile")} onClick={() => navigate("/profile")}>
          Profile
        </button>
        <button type="button" className={navClass("friends")} onClick={() => navigate("/friends")}>
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
