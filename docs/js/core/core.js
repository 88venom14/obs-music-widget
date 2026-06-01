// ESM bridge to the pure helpers in widget-core.js. That file is a UMD module
// loaded as a classic <script> before this module graph (so globalThis.WidgetCore
// is already set) and is also require()'d by the Node test suite. Re-exporting
// here lets the rest of the app `import` the helpers normally without changing
// widget-core.js or the tests.

const WidgetCore = globalThis.WidgetCore || {};

export const {
  FONT_FAMILIES,
  DEFAULT_SETTINGS,
  hexToRgba,
  normalizeSettings,
  safeCssUrl,
  getRecommendedWidgetSize,
  spotifyPlaybackToPayload,
  lastfmCacheKey,
  bytesToBase64Url,
  encodeData,
  decodeData
} = WidgetCore;
