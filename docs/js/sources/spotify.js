// Spotify Authorization Code + PKCE flow, token refresh, and currently-playing
// fetch. No client secret is used or stored.
import {
  AUTHORIZE_ENDPOINT,
  TOKEN_ENDPOINT,
  CURRENTLY_PLAYING_ENDPOINT,
  SCOPE,
  VERIFIER_KEY,
  STATE_KEY,
  REDIRECT_KEY,
  POLLING_INTERVAL_MS
} from "../core/config.js";
import { bytesToBase64Url, spotifyPlaybackToPayload } from "../core/core.js";
import { isClientConfigured, getClientId, getRedirectUri, saveAuth } from "./credentials.js";
import { showWarning, hideWarning } from "../dashboard/ui.js";
import { updateWidgetUrl } from "../widget/widget-url.js";

function randomBase64Url(byteCount) {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Base64Url(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(hash));
}

export async function beginSpotifyLogin() {
  if (!isClientConfigured()) {
    showWarning("Сначала вставьте свой Spotify Client ID и добавьте показанный Redirect URI в настройки Spotify app.");
    return;
  }

  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);
  const oauthState = randomBase64Url(16);
  const redirectUri = getRedirectUri();

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, oauthState);
  sessionStorage.setItem(REDIRECT_KEY, redirectUri);

  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", oauthState);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);

  window.location.assign(url.toString());
}

async function requestToken(body) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw await makeSpotifyError(response, "Spotify token request");
  }

  return response.json();
}

async function readSpotifyError(response) {
  try {
    const body = await response.clone().json();
    return body?.error?.message || body?.error_description || "";
  } catch (_jsonError) {
    try {
      return (await response.clone().text()).trim();
    } catch (_textError) {
      return "";
    }
  }
}

async function makeSpotifyError(response, area) {
  const details = await readSpotifyError(response);
  if (response.status === 403) {
    return new Error(
      `${area} вернул HTTP 403. Client secret для GitHub Pages не нужен. Если вы используете свой Client ID, проверьте, что аккаунт владельца Spotify app имеет Premium, Redirect URI добавлен точно, а затем выйдите и войдите заново.${details ? ` Spotify: ${details}` : ""}`
    );
  }

  return new Error(`${area} failed with HTTP ${response.status}${details ? `: ${details}` : ""}`);
}

function retryAfterToMs(response) {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) {
    return POLLING_INTERVAL_MS;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(seconds * 1000, POLLING_INTERVAL_MS);
  }

  const retryAt = Date.parse(retryAfter);
  return Number.isNaN(retryAt) ? POLLING_INTERVAL_MS : Math.max(retryAt - Date.now(), POLLING_INTERVAL_MS);
}

export async function handleAuthCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    showWarning(`Spotify вернул ошибку авторизации: ${error}`);
    history.replaceState({}, "", getRedirectUri());
    return;
  }

  if (!code) {
    return;
  }

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const actualState = url.searchParams.get("state");
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const redirectUri = sessionStorage.getItem(REDIRECT_KEY) || getRedirectUri();

  if (!expectedState || expectedState !== actualState || !verifier) {
    showWarning("OAuth-сессия не совпала. Попробуйте войти через Spotify еще раз.");
    history.replaceState({}, "", getRedirectUri());
    return;
  }

  try {
    const token = await requestToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: getClientId(),
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier
      })
    );

    if (!token.refresh_token) {
      throw new Error("Spotify did not return refresh_token");
    }

    saveAuth({
      clientId: getClientId(),
      refreshToken: token.refresh_token,
      accessToken: token.access_token,
      expiresAt: Date.now() + Math.max(Number(token.expires_in || 3600) - 60, 1) * 1000
    });

    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(REDIRECT_KEY);
    history.replaceState({}, "", redirectUri);
    hideWarning();
  } catch (tokenError) {
    showWarning(`Не удалось получить Spotify token: ${tokenError.message}`);
  }
}

async function refreshAccessToken(auth) {
  const token = await requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: auth.clientId,
      refresh_token: auth.refreshToken
    })
  );

  const nextAuth = {
    ...auth,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + Math.max(Number(token.expires_in || 3600) - 60, 1) * 1000
  };

  return nextAuth;
}

async function getAccessToken(auth, persist) {
  if (auth.accessToken && auth.expiresAt > Date.now()) {
    return auth;
  }

  const nextAuth = await refreshAccessToken(auth);
  if (persist) {
    saveAuth(nextAuth);
    updateWidgetUrl();
  }
  return nextAuth;
}

export async function fetchCurrentTrack(auth, persist) {
  let nextAuth = await getAccessToken(auth, persist);
  let response = await fetch(CURRENTLY_PLAYING_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${nextAuth.accessToken}`
    }
  });

  if (response.status === 401) {
    nextAuth = await refreshAccessToken(nextAuth);
    if (persist) {
      saveAuth(nextAuth);
      updateWidgetUrl();
    }
    response = await fetch(CURRENTLY_PLAYING_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${nextAuth.accessToken}`
      }
    });
  }

  if (response.status === 204) {
    return { state: "stopped", track: null, auth: nextAuth };
  }

  if (response.status === 429) {
    return { state: "unchanged", track: null, auth: nextAuth, retryAfterMs: retryAfterToMs(response) };
  }

  if (!response.ok) {
    throw await makeSpotifyError(response, "Spotify currently-playing");
  }

  const playback = await response.json();
  return { ...spotifyPlaybackToPayload(playback), auth: nextAuth };
}
