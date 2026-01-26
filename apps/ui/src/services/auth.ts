import { trace } from "@opentelemetry/api";
import { asRecord, readTrimmedString } from "../utils/unknown";

const DEFAULT_KEYCLOAK_URL = "http://localhost:8080";
const DEFAULT_REALM = "poker-local";
const DEFAULT_CLIENT_ID = "poker-ui";
const PKCE_STORAGE_KEY = "poker.auth.pkce_verifier";
const TOKEN_STORAGE_KEY = "poker.auth.token";

// Tokens stored in memory + sessionStorage for refresh durability (never localStorage)
let accessToken: string | null = null;

export function setToken(token: string) {
  accessToken = token;
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function getToken() {
  if (!accessToken) {
    const cached = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (cached) {
      accessToken = cached;
    }
  }
  return accessToken;
}

export function clearToken() {
  accessToken = null;
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

function getKeycloakConfig() {
  const keycloakUrl =
    (window as Window & { __KEYCLOAK_URL__?: string }).__KEYCLOAK_URL__ ??
    DEFAULT_KEYCLOAK_URL;
  const realm =
    (window as Window & { __KEYCLOAK_REALM__?: string }).__KEYCLOAK_REALM__ ?? DEFAULT_REALM;
  const clientId =
    (window as Window & { __KEYCLOAK_CLIENT_ID__?: string }).__KEYCLOAK_CLIENT_ID__ ??
    DEFAULT_CLIENT_ID;
  return { keycloakUrl, realm, clientId };
}

function base64UrlEncode(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function createVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
}

export async function startLogin(redirectUri: string) {
  const { keycloakUrl, realm, clientId } = getKeycloakConfig();
  const verifier = createVerifier();
  const challenge = await sha256(verifier);

  sessionStorage.setItem(PKCE_STORAGE_KEY, verifier);
  const tracer = trace.getTracer("ui");
  const span = tracer.startSpan("ui.auth.start", {
    attributes: {
      "auth.provider": "keycloak",
    },
  });
  span.end();

  const authorizeUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.assign(`${authorizeUrl}?${params.toString()}`);
}

export async function hydrateTokenFromCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) {
    return null;
  }

  const verifier = sessionStorage.getItem(PKCE_STORAGE_KEY);
  if (!verifier) {
    throw new Error("Missing PKCE verifier");
  }

  const { keycloakUrl, realm, clientId } = getKeycloakConfig();
  const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: window.location.origin,
    code_verifier: verifier,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const payload = asRecord(await response.json());
  const accessToken = readTrimmedString(payload?.access_token) ?? null;

  if (accessToken) {
    setToken(accessToken);
    const tracer = trace.getTracer("ui");
    const span = tracer.startSpan("ui.auth.login", {
      attributes: {
        "auth.provider": "keycloak",
      },
    });
    span.end();
    sessionStorage.removeItem(PKCE_STORAGE_KEY);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  return accessToken;
}
