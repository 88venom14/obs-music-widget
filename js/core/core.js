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
