import {
  SITE_CONFIG,
  CLIENT_ID_PLACEHOLDER,
  CLIENT_ID_STORAGE_KEY,
  PROVIDER_STORAGE_KEY,
  LASTFM_STORAGE_KEY,
  STORAGE_KEY
} from "../core/config.js";
import { state, controls } from "../core/state.js";
import { showWarning, hideWarning, updateAuthUi, updateProviderUi } from "../dashboard/ui.js";
import { updateWidgetUrl } from "../widget/widget-url.js";
import { refreshPreview } from "../widget/widget-render.js";

export function getSiteClientId() {
  return String(SITE_CONFIG.spotifyClientId || "").trim();
}

export function getStoredClientId() {
  return String(localStorage.getItem(CLIENT_ID_STORAGE_KEY) || "").trim();
}

export function getStoredProvider() {
  const provider = localStorage.getItem(PROVIDER_STORAGE_KEY);
  return provider === "lastfm" ? "lastfm" : "spotify";
}

export function getClientId() {
  return getStoredClientId() || getSiteClientId();
}

export function isUsableClientId(clientId) {
  return Boolean(clientId) && clientId !== CLIENT_ID_PLACEHOLDER;
}

export function isClientConfigured() {
  return isUsableClientId(getClientId());
}

export function loadLastfmConfig() {
  try {
    const raw = localStorage.getItem(LASTFM_STORAGE_KEY);
    const config = raw ? JSON.parse(raw) : null;
    if (!config?.username || !config?.apiKey) {
      return null;
    }
    return {
      username: String(config.username).trim(),
      apiKey: String(config.apiKey).trim()
    };
  } catch (_error) {
    return null;
  }
}

export function isLastfmConfigured() {
  return Boolean(state.lastfmConfig?.username && state.lastfmConfig?.apiKey);
}

export function getRedirectUri() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function saveAuth(auth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  state.previewAuth = auth;
}

export function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const auth = raw ? JSON.parse(raw) : null;
    if (auth?.clientId && (!isClientConfigured() || auth.clientId !== getClientId())) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return auth;
  } catch (_error) {
    return null;
  }
}

export function resetAuth() {
  localStorage.removeItem(STORAGE_KEY);
  state.previewAuth = null;
  state.previewTrackKey = "";
}

export function saveUserClientId() {
  const clientId = controls.clientIdInput.value.trim();
  if (!isUsableClientId(clientId)) {
    showWarning("Вставьте Client ID из Spotify Developer Dashboard. Client Secret сюда не нужен.");
    return;
  }

  const previousClientId = getClientId();
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);

  if (previousClientId !== clientId) {
    resetAuth();
  }

  controls.clientIdInput.value = clientId;
  updateAuthUi();
  updateWidgetUrl();
  hideWarning();
}

export function saveLastfmConfig() {
  const config = {
    username: controls.lastfmUsername.value.trim(),
    apiKey: controls.lastfmApiKey.value.trim()
  };

  if (!config.username || !config.apiKey) {
    showWarning("Укажите Last.fm username и Last.fm API key.");
    return;
  }

  localStorage.setItem(LASTFM_STORAGE_KEY, JSON.stringify(config));
  state.lastfmConfig = config;
  setProvider("lastfm");
  updateWidgetUrl();
  void refreshPreview();
  hideWarning();
}

export function setProvider(provider) {
  state.provider = provider === "lastfm" ? "lastfm" : "spotify";
  localStorage.setItem(PROVIDER_STORAGE_KEY, state.provider);
  state.previewAuth = state.provider === "spotify" ? loadAuth() : null;
  updateProviderUi();
  updateAuthUi();
  updateWidgetUrl();
}
