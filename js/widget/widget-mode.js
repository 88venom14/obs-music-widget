import { state, widget } from "../core/state.js";
import { POLLING_INTERVAL_MS, PLACEHOLDER_ART } from "../core/config.js";
import { decodeData } from "../core/core.js";
import { applySettings } from "./settings.js";
import { renderWidget } from "./widget-render.js";
import { fetchCurrentTrack } from "../sources/spotify.js";
import { fetchLastfmTrack } from "../sources/lastfm.js";

function parseWidgetData() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const raw = params.get("data");
  return raw ? decodeData(raw) : null;
}

export async function runWidgetMode() {
  document.body.classList.add("widget-mode");
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("widget-root").classList.remove("hidden");

  let data;
  try {
    data = parseWidgetData();
  } catch (error) {
    console.error("Invalid widget URL data.", error);
    return;
  }

  if (data?.provider === "lastfm") {
    if (!data?.lastfm?.username || !data?.lastfm?.apiKey || !data?.settings) {
      console.error("Widget URL is missing Last.fm data.");
      return;
    }

    applySettings(data.settings);

    const tick = async () => {
      try {
        const payload = await fetchLastfmTrack(data.lastfm, "widget");
        renderWidget(widget, payload, data.settings, "widgetTrackKey");
      } catch (error) {
        console.error("Last.fm widget polling failed.", error);
      }
    };

    await tick();
    state.widgetTimer = window.setInterval(tick, POLLING_INTERVAL_MS);
    return;
  }

  if (!data?.clientId || !data?.refreshToken || !data?.settings) {
    console.error("Widget URL is missing Spotify token data.");
    return;
  }

  applySettings(data.settings);

  let auth = {
    clientId: data.clientId,
    refreshToken: data.refreshToken,
    accessToken: "",
    expiresAt: 0
  };

  const tick = async () => {
    if (Date.now() < state.widgetNextPollAt) {
      return;
    }

    try {
      const payload = await fetchCurrentTrack(auth, false);
      auth = payload.auth;
      if (payload.retryAfterMs) {
        state.widgetNextPollAt = Date.now() + payload.retryAfterMs;
      }
      renderWidget(widget, payload, data.settings, "widgetTrackKey");
    } catch (error) {
      console.error("Widget polling failed.", error);
    }
  };

  await tick();
  state.widgetTimer = window.setInterval(tick, POLLING_INTERVAL_MS);
}

export function bindWidgetMode() {
  widget.root = document.getElementById("widget");
  widget.art = document.getElementById("album-art");
  widget.artContainer = widget.root.querySelector(".art-container");
  widget.info = widget.root.querySelector(".track-info");
  widget.title = document.getElementById("track-title");
  widget.artist = document.getElementById("track-artist");
  widget.titleWrapper = widget.root.querySelector(".track-title-wrapper");
  widget.artistWrapper = widget.root.querySelector(".track-artist-wrapper");
  widget.visualizer = document.getElementById("visualizer");
  widget.progressFill = document.getElementById("progress-fill");
  widget.time = document.getElementById("track-time");
  widget.art.addEventListener("error", () => {
    if (widget.art.src !== PLACEHOLDER_ART) {
      widget.art.src = PLACEHOLDER_ART;
    }
  });
}
