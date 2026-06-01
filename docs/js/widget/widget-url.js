import { state, controls } from "../core/state.js";
import { encodeData } from "../core/core.js";
import { isLastfmConfigured, isClientConfigured } from "../sources/credentials.js";
import { getSettings } from "./settings.js";

function getBaseWidgetUrl() {
  const url = new URL(window.location.href);
  url.search = "?widget=1";
  url.hash = "";
  return url.toString();
}

export function updateWidgetUrl() {
  if (!controls.widgetUrl) {
    return;
  }

  if (state.provider === "lastfm") {
    if (!isLastfmConfigured()) {
      controls.widgetUrl.value = "Сначала укажите Last.fm username и API key.";
      controls.copyUrl.disabled = true;
      return;
    }

    const payload = {
      v: 2,
      provider: "lastfm",
      lastfm: state.lastfmConfig,
      settings: getSettings()
    };

    controls.widgetUrl.value = `${getBaseWidgetUrl()}#data=${encodeData(payload)}`;
    controls.copyUrl.disabled = false;
    return;
  }

  const auth = state.previewAuth;
  if (!auth?.refreshToken) {
    controls.widgetUrl.value = isClientConfigured() ? "Сначала войдите через Spotify." : "Сначала вставьте Spotify Client ID.";
    controls.copyUrl.disabled = true;
    return;
  }

  const payload = {
    v: 1,
    clientId: auth.clientId,
    refreshToken: auth.refreshToken,
    settings: getSettings()
  };

  controls.widgetUrl.value = `${getBaseWidgetUrl()}#data=${encodeData(payload)}`;
  controls.copyUrl.disabled = false;
}
