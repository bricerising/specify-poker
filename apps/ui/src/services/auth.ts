import { apiFetch } from "./apiClient";

const TOKEN_KEY = "poker.auth.token";
const DEFAULT_KEYCLOAK_URL = "http://localhost:8080";
const DEFAULT_REALM = "poker-local";
const DEFAULT_CLIENT_ID = "poker-ui";

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export function buildLoginUrl(redirectUri: string) {
  const keycloakUrl =
    (window as Window & { __KEYCLOAK_URL__?: string }).__KEYCLOAK_URL__ ??
    DEFAULT_KEYCLOAK_URL;
  const realm =
    (window as Window & { __KEYCLOAK_REALM__?: string }).__KEYCLOAK_REALM__ ?? DEFAULT_REALM;
  const clientId =
    (window as Window & { __KEYCLOAK_CLIENT_ID__?: string }).__KEYCLOAK_CLIENT_ID__ ??
    DEFAULT_CLIENT_ID;

  const authorizeUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "token",
    scope: "openid profile",
  });

  return `${authorizeUrl}?${params.toString()}`;
}

export function hydrateTokenFromHash() {
  if (!window.location.hash) {
    return null;
  }

  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");

  if (accessToken) {
    setToken(accessToken);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  return accessToken;
}

export async function fetchCurrentProfile() {
  const response = await apiFetch("/api/me");
  return response.json();
}
