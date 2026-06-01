import { state, preview } from "../core/state.js";
import { PLACEHOLDER_ART } from "../core/config.js";
import { normalizeSettings } from "../core/core.js";
import { getSettings, applySettings } from "./settings.js";
import { isLastfmConfigured } from "../sources/credentials.js";
import { fetchCurrentTrack } from "../sources/spotify.js";
import { fetchLastfmTrack } from "../sources/lastfm.js";
import { showWarning, hideWarning } from "../dashboard/ui.js";

function setWidgetVisible(root, visible) {
  root.classList.toggle("widget--visible", visible);
  root.classList.toggle("widget--hidden", !visible);
}

function resolveArtSrc(artUrl) {
  return artUrl && artUrl.trim() ? artUrl : PLACEHOLDER_ART;
}

function setAlbumArt(image, artUrl) {
  const nextSrc = resolveArtSrc(artUrl);
  if (image.src !== nextSrc) {
    image.src = nextSrc;
  }
}

function updateMarquee(textElement, wrapperElement) {
  textElement.classList.remove("is-marquee");
  textElement.style.removeProperty("--marquee-offset");

  if (!state.marqueeEnabled) {
    return;
  }

  requestAnimationFrame(() => {
    const overflow = textElement.scrollWidth - wrapperElement.clientWidth;
    if (overflow > 2) {
      textElement.style.setProperty("--marquee-offset", `-${overflow + 16}px`);
      textElement.classList.add("is-marquee");
    }
  });
}

function refreshTextLayout(target) {
  if (!target.title || !target.artist) {
    return;
  }

  updateMarquee(target.title, target.titleWrapper);
  updateMarquee(target.artist, target.artistWrapper);
}

function getTextLayoutKey(target, settings) {
  const s = normalizeSettings(settings);
  return [
    target.title.textContent,
    target.artist.textContent,
    s.widgetWidth,
    s.artSize,
    s.widgetPadding,
    s.widgetGap,
    s.fontScale,
    s.titleSize,
    s.artistSize,
    s.fontFamily,
    s.googleFontUrl,
    s.textAlign,
    s.enableMarquee,
    s.showArt,
    s.showVisualizer
  ].join("\x1f");
}

function formatTime(ms) {
  const totalSeconds = Math.max(Math.floor(Number(ms || 0) / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getProgressMs(payload) {
  const durationMs = Number(payload.track?.durationMs || 0);
  if (!durationMs) {
    return 0;
  }

  const sampledAt = Number(payload.track?.sampledAt || Date.now());
  const baseProgress = Number(payload.track?.progressMs || 0);
  const liveOffset = payload.state === "playing" ? Date.now() - sampledAt : 0;
  return Math.min(Math.max(baseProgress + liveOffset, 0), durationMs);
}

function setProgressFill(fill, fraction) {
  fill.style.transform = `scaleX(${Math.min(Math.max(fraction, 0), 1)})`;
}

function updateWidgetOptions(target, settings, payload) {
  const nextSettings = normalizeSettings(settings);
  const hasProgress = Boolean(payload?.track?.durationMs);
  target.root.classList.toggle("widget--no-art", !nextSettings.showArt);
  target.root.classList.toggle("widget--no-visualizer", !nextSettings.showVisualizer);
  target.root.classList.toggle("widget--no-progress", !nextSettings.showProgress || !hasProgress);
  target.root.classList.toggle("widget--no-time", !nextSettings.showTime || !hasProgress);

  const bgType = ["color", "gradient", "image", "albumart"].includes(nextSettings.bgType) ? nextSettings.bgType : "color";
  target.root.classList.toggle("widget--bg-gradient", bgType === "gradient");
  target.root.classList.toggle("widget--bg-image", bgType === "image");
  target.root.classList.toggle("widget--bg-albumart", bgType === "albumart");
}

function updateProgress(target, payload) {
  if (!target.progressFill || !target.time || !payload.track?.durationMs || !target.lastSettings) {
    return;
  }

  const durationMs = Number(payload.track.durationMs);
  const progressMs = getProgressMs(payload);
  setProgressFill(target.progressFill, progressMs / durationMs);
  target.time.textContent = `${formatTime(progressMs)} / ${formatTime(durationMs)}`;
  target.shownSecond = Math.floor(progressMs / 1000);
  const settings = normalizeSettings(target.lastSettings);
  target.progressFill.style.display = settings.showProgress ? "" : "none";
  target.time.style.display = settings.showTime ? "" : "none";
}

function paintProgressFrame(target) {
  const payload = target.lastPayload;
  if (!target.progressFill || !target.time || !payload?.track?.durationMs) {
    return;
  }

  const durationMs = Number(payload.track.durationMs);
  const progressMs = getProgressMs(payload);
  setProgressFill(target.progressFill, progressMs / durationMs);

  const shownSecond = Math.floor(progressMs / 1000);
  if (shownSecond !== target.shownSecond) {
    target.shownSecond = shownSecond;
    target.time.textContent = `${formatTime(progressMs)} / ${formatTime(durationMs)}`;
  }
}

function ensureProgressTicker(target) {
  if (target.progressRaf) {
    return;
  }

  const frame = () => {
    target.progressRaf = window.requestAnimationFrame(frame);

    if (!target.lastPayload || !target.lastSettings) {
      return;
    }

    if (target.lastPayload.state !== "playing" || target.root.classList.contains("widget--hidden")) {
      return;
    }

    paintProgressFrame(target);
  };

  target.progressRaf = window.requestAnimationFrame(frame);
}

export function renderWidget(target, payload, settings, trackKeyName) {
  const nextSettings = normalizeSettings(settings);
  updateWidgetOptions(target, nextSettings, payload);
  target.lastPayload = payload;
  target.lastSettings = nextSettings;
  ensureProgressTicker(target);

  if (payload.state === "unchanged") {
    return;
  }

  if (payload.state === "stopped" || (payload.state === "paused" && nextSettings.hideOnPause)) {
    target.visualizer.classList.add("paused");
    setWidgetVisible(target.root, false);
    return;
  }

  if (!payload.track) {
    setWidgetVisible(target.root, false);
    return;
  }

  const nextTrackKey = `${payload.track.title}\u0000${payload.track.artist}\u0000${payload.track.album}\u0000${payload.track.artUrl}`;
  if (state[trackKeyName] !== nextTrackKey) {
    state[trackKeyName] = nextTrackKey;
    target.info.classList.add("fading");
    target.artContainer.classList.add("fading");
    window.clearTimeout(target.fadeTimer);
    target.fadeTimer = window.setTimeout(() => {
      setAlbumArt(target.art, payload.track.artUrl);
      target.root.style.setProperty("--bg-art-url", `url("${resolveArtSrc(payload.track.artUrl)}")`);
      target.title.textContent = payload.track.title;
      target.artist.textContent = payload.track.artist;
      updateMarquee(target.title, target.titleWrapper);
      updateMarquee(target.artist, target.artistWrapper);
      updateProgress(target, payload);
      target.lastLayoutKey = getTextLayoutKey(target, nextSettings);
      target.info.classList.remove("fading");
      target.artContainer.classList.remove("fading");
      target.fadeTimer = 0;
    }, 180);
  } else {
    updateProgress(target, payload);
    const layoutKey = getTextLayoutKey(target, nextSettings);
    if (target.lastLayoutKey !== layoutKey) {
      target.lastLayoutKey = layoutKey;
      refreshTextLayout(target);
    }
  }

  setWidgetVisible(target.root, true);
  target.visualizer.classList.toggle("paused", payload.state !== "playing");
}

export function renderMockPreview() {
  const durationMs = 244000;
  if (!state.mockStartedAt) {
    state.mockStartedAt = Date.now() - 78000;
  }
  const progressMs = (Date.now() - state.mockStartedAt) % durationMs;

  renderWidget(
    preview,
    {
      state: "playing",
      track: {
        title: "Midnight City",
        artist: "M83",
        album: "Hurry Up, We're Dreaming",
        artUrl: "",
        durationMs,
        progressMs,
        sampledAt: Date.now()
      }
    },
    getSettings(),
    "previewTrackKey"
  );
}

export async function refreshPreview() {
  applySettings(getSettings());

  if (Date.now() < state.previewNextPollAt) {
    return;
  }

  if (state.provider === "lastfm") {
    if (!isLastfmConfigured()) {
      renderMockPreview();
      return;
    }

    try {
      const payload = await fetchLastfmTrack(state.lastfmConfig, "preview");
      renderWidget(preview, payload, getSettings(), "previewTrackKey");
      hideWarning();
    } catch (error) {
      showWarning(`Не удалось прочитать текущий трек Last.fm: ${error.message}`);
    }
    return;
  }

  if (!state.previewAuth) {
    renderMockPreview();
    return;
  }

  try {
    const payload = await fetchCurrentTrack(state.previewAuth, true);
    state.previewAuth = payload.auth;
    if (payload.retryAfterMs) {
      state.previewNextPollAt = Date.now() + payload.retryAfterMs;
    }
    renderWidget(preview, payload, getSettings(), "previewTrackKey");
    hideWarning();
  } catch (error) {
    showWarning(`Не удалось прочитать текущий трек Spotify: ${error.message}`);
  }
}
