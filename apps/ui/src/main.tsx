import React from "react";
import { createRoot } from "react-dom/client";

import { initUiTelemetry, recordNavigation } from "./observability/otel";
import { buildLoginUrl, hydrateTokenFromHash, isAuthenticated } from "./services/auth";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

initUiTelemetry();
recordNavigation(window.location.pathname);
hydrateTokenFromHash();

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <div>
      <h1>Specify Poker MVP</h1>
      {isAuthenticated() ? (
        <div>Signed in</div>
      ) : (
        <a href={buildLoginUrl(window.location.origin)}>Login</a>
      )}
    </div>
  </React.StrictMode>,
);
