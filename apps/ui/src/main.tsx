import React from "react";
import { createRoot } from "react-dom/client";

import { LobbyPage } from "./pages/LobbyPage";
import { TablePage } from "./pages/TablePage";
import { initUiTelemetry, recordNavigation } from "./observability/otel";
import { buildLoginUrl, hydrateTokenFromHash, isAuthenticated } from "./services/auth";
import { tableStore } from "./state/tableStore";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

initUiTelemetry();
recordNavigation(window.location.pathname);
hydrateTokenFromHash();

const root = createRoot(rootElement);

function PokerApp() {
  const [state, setState] = React.useState(tableStore.getState());

  React.useEffect(() => tableStore.subscribe(setState), []);

  if (state.tableState) {
    return <TablePage store={tableStore} />;
  }

  return <LobbyPage store={tableStore} />;
}

root.render(
  <React.StrictMode>
    <div>
      <h1>Specify Poker MVP</h1>
      {isAuthenticated() ? (
        <PokerApp />
      ) : (
        <a href={buildLoginUrl(window.location.origin)}>Login</a>
      )}
    </div>
  </React.StrictMode>,
);
