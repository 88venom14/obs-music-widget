// Shared pure helpers for the GitHub Pages widget.
//
// This module is loaded as a plain <script> before app.js (it assigns
// globalThis.WidgetCore) and is also require()'d by the Node test suite.
// Keep everything here free of DOM and browser-only side effects so it stays
// testable. Only platform globals available in both environments are used
// (btoa/atob, TextEncoder/TextDecoder, URL, JSON, Math, Date).
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.WidgetCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FONT_FAMILIES = {
    system: '"SF Pro Display", "Inter", system-ui, sans-serif',
    inter: '"Inter", "Segoe UI", system-ui, sans-serif',
    rounded: '"Arial Rounded MT Bold", "SF Pro Rounded", "Segoe UI", system-ui, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
  };

  const DEFAULT_SETTINGS = {
    bgColor: "#101014",
    bgAlpha: 0.75,
    bgType: "color",
    bgColor2: "#2a2a32",
    bgGradientAngle: 135,
    bgImageUrl: "",
    bgImageBlur: 0,
    bgImageOverlay: 0.4,
    bgArtBlur: 28,
    bgArtOverlay: 0.45,
    textColor: "#ffffff",
    mutedColor: "#8e8e93",
    accentColor: "#1db954",
    fontFamily: "system",
    googleFontUrl: "",
    textAlign: "left",
    widgetWidth: 420,
    widgetHeight: 90,
    widgetRadius: 14,
    artSize: 66,
    widgetPadding: 12,
    widgetGap: 14,
    fontScale: 1,
    titleSize: 20,
    artistSize: 15,
    progressHeight: 4,
    progressBgAlpha: 0.18,
    backdropBlur: 16,
    shadowOpacity: 0.24,
    shadowBlur: 30,
    borderWidth: 0,
    borderColor: "#ffffff",
    borderAlpha: 0.35,
    visualizerHeight: 20,
    visualizerBarWidth: 3,
    visualizerSpeed: 0.8,
    marqueeSpeed: 8,
    hideOnPause: true,
    showArt: true,
    showVisualizer: true,
    showProgress: true,
    showTime: true,
    enableMarquee: true,
    customCss: ""
  };

  function hexToRgba(hex, alpha) {
    const value = hex.replace("#", "");
    const red = parseInt(value.slice(0, 2), 16);
    const green = parseInt(value.slice(2, 4), 16);
    const blue = parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function normalizeSettings(settings) {
    return { ...DEFAULT_SETTINGS, ...(settings || {}) };
  }

  // Turns a user-supplied background URL into a safe CSS url() value.
  // Only http/https absolute URLs are allowed; anything else becomes "none".
  // Quotes and backslashes are escaped so the value cannot break out of url("...").
  function safeCssUrl(url) {
    if (typeof url !== "string" || url.trim() === "") {
      return "none";
    }
    let parsed;
    try {
      parsed = new URL(url.trim());
    } catch (_error) {
      return "none";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "none";
    }
    const escaped = parsed.href.replace(/[\\"]/g, (char) => `\\${char}`);
    return `url("${escaped}")`;
  }

  function getRecommendedWidgetSize(settings) {
    const nextSettings = normalizeSettings(settings);
    const paddingX = Math.round(nextSettings.widgetPadding * 1.15);
    const border = nextSettings.borderWidth * 2;
    const visualizerWidth = nextSettings.showVisualizer ? nextSettings.visualizerBarWidth * 4 + 9 : 0;
    const artWidth = nextSettings.showArt ? nextSettings.artSize : 0;
    const textWidth = 160;
    const horizontalGaps =
      (nextSettings.showArt ? nextSettings.widgetGap : 0) +
      (nextSettings.showVisualizer ? nextSettings.widgetGap : 0);

    const titleHeight = nextSettings.titleSize * nextSettings.fontScale * 1.18;
    const artistHeight = nextSettings.artistSize * nextSettings.fontScale * 1.25 + 6;
    const progressHeight = nextSettings.showProgress ? Math.max(nextSettings.progressHeight, 11 * nextSettings.fontScale) + 7 : 0;
    const textHeight = titleHeight + artistHeight + progressHeight;
    const visualizerHeight = nextSettings.showVisualizer ? nextSettings.visualizerHeight : 0;
    const artHeight = nextSettings.showArt ? nextSettings.artSize : 0;

    return {
      width: paddingX * 2 + artWidth + textWidth + visualizerWidth + horizontalGaps + border,
      height: nextSettings.widgetPadding * 2 + Math.max(artHeight, textHeight, visualizerHeight) + border
    };
  }

  function spotifyPlaybackToPayload(playback) {
    if (playback.currently_playing_type !== "track" || !playback.item) {
      return { state: "stopped", track: null };
    }

    const images = [...(playback.item.album?.images || [])].sort((left, right) => (right.width || 0) - (left.width || 0));

    return {
      state: playback.is_playing ? "playing" : "paused",
      track: {
        title: playback.item.name || "Unknown Track",
        artist: (playback.item.artists || []).map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown Artist",
        album: playback.item.album?.name || "",
        artUrl: images.find((image) => image.url)?.url || "",
        trackUrl: playback.item.external_urls?.spotify || "",
        durationMs: Number(playback.item.duration_ms || 0),
        progressMs: Number(playback.progress_ms || 0),
        sampledAt: Date.now()
      }
    };
  }

  function lastfmCacheKey(artist, title) {
    return `${artist.toLowerCase()}\u0000${title.toLowerCase()}`;
  }

  function bytesToBase64Url(bytes) {
    let value = "";
    for (const byte of bytes) {
      value += String.fromCharCode(byte);
    }
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function stringToBase64Url(value) {
    const bytes = new TextEncoder().encode(value);
    return bytesToBase64Url(bytes);
  }

  function encodeData(value) {
    return stringToBase64Url(JSON.stringify(value));
  }

  function decodeData(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  return {
    FONT_FAMILIES,
    DEFAULT_SETTINGS,
    hexToRgba,
    normalizeSettings,
    safeCssUrl,
    getRecommendedWidgetSize,
    spotifyPlaybackToPayload,
    lastfmCacheKey,
    bytesToBase64Url,
    stringToBase64Url,
    encodeData,
    decodeData
  };
});
