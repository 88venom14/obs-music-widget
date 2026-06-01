// Shared mutable singletons. These objects are imported by reference across
// modules, so every importer sees the same instance (ES module live bindings).
// `controls`, `preview`, and `widget` start empty and are populated by the bind
// functions in dashboard.js / widget-mode.js. No imports (leaf module).

export const state = {
  provider: "spotify",
  lastfmConfig: null,
  previewAuth: null,
  previewTrackKey: "",
  widgetTrackKey: "",
  previewTimer: 0,
  widgetTimer: 0,
  previewNextPollAt: 0,
  widgetNextPollAt: 0,
  lastfmDurationCache: {},
  lastfmProgress: {
    preview: { trackKey: "", startedAt: 0 },
    widget: { trackKey: "", startedAt: 0 }
  },
  mockStartedAt: 0,
  marqueeEnabled: true
};

export const controls = {};
export const preview = {};
export const widget = {};
