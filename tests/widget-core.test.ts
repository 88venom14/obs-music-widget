import assert from "node:assert/strict";
import test from "node:test";

// widget-core.js is a browser UMD module shared with docs/app.js. It exposes a
// CommonJS export, so require() avoids TypeScript module resolution for plain JS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require("../docs/js/core/widget-core.js");

test("hexToRgba converts hex and applies alpha", () => {
  assert.equal(core.hexToRgba("#1db954", 0.5), "rgba(29, 185, 84, 0.5)");
  assert.equal(core.hexToRgba("ffffff", 1), "rgba(255, 255, 255, 1)");
});

test("normalizeSettings fills defaults and keeps overrides", () => {
  const result = core.normalizeSettings({ widgetWidth: 500, fontFamily: "mono" });
  assert.equal(result.widgetWidth, 500);
  assert.equal(result.fontFamily, "mono");
  // untouched default
  assert.equal(result.widgetHeight, core.DEFAULT_SETTINGS.widgetHeight);
});

test("normalizeSettings tolerates null/undefined", () => {
  assert.deepEqual(core.normalizeSettings(null), core.DEFAULT_SETTINGS);
  assert.deepEqual(core.normalizeSettings(undefined), core.DEFAULT_SETTINGS);
});

test("safeCssUrl accepts http/https and escapes quotes", () => {
  assert.equal(core.safeCssUrl("https://example.com/a.png"), 'url("https://example.com/a.png")');
  assert.equal(core.safeCssUrl("http://example.com/b.jpg"), 'url("http://example.com/b.jpg")');
});

test("safeCssUrl rejects dangerous or invalid input", () => {
  assert.equal(core.safeCssUrl("javascript:alert(1)"), "none");
  assert.equal(core.safeCssUrl("data:image/png;base64,AAAA"), "none");
  assert.equal(core.safeCssUrl("not a url"), "none");
  assert.equal(core.safeCssUrl(""), "none");
  assert.equal(core.safeCssUrl("   "), "none");
  assert.equal(core.safeCssUrl(null), "none");
  assert.equal(core.safeCssUrl(undefined), "none");
});

test("safeCssUrl cannot break out of url()", () => {
  // A URL crafted to inject extra CSS must stay inside the quoted url().
  const result = core.safeCssUrl('https://example.com/a.png");}body{display:none');
  assert.ok(result.startsWith('url("https://example.com/'));
  // Any quote that survives parsing is backslash-escaped.
  assert.ok(!/[^\\]"[^)]/.test(result.slice(4)));
});

test("getRecommendedWidgetSize returns positive dimensions and reacts to toggles", () => {
  const full = core.getRecommendedWidgetSize({});
  assert.ok(full.width > 0 && full.height > 0);

  const noArt = core.getRecommendedWidgetSize({ showArt: false });
  assert.ok(noArt.width < full.width, "hiding art should reduce recommended width");
});

test("spotifyPlaybackToPayload maps a playing track", () => {
  const payload = core.spotifyPlaybackToPayload({
    currently_playing_type: "track",
    is_playing: true,
    progress_ms: 12000,
    item: {
      name: "Song",
      duration_ms: 200000,
      artists: [{ name: "A" }, { name: "B" }],
      album: { name: "Album", images: [{ url: "small", width: 64 }, { url: "big", width: 640 }] },
      external_urls: { spotify: "https://open.spotify.com/track/1" }
    }
  });

  assert.equal(payload.state, "playing");
  assert.equal(payload.track.title, "Song");
  assert.equal(payload.track.artist, "A, B");
  assert.equal(payload.track.album, "Album");
  assert.equal(payload.track.artUrl, "big", "should pick the largest image");
  assert.equal(payload.track.trackUrl, "https://open.spotify.com/track/1");
  assert.equal(payload.track.durationMs, 200000);
  assert.equal(payload.track.progressMs, 12000);
});

test("spotifyPlaybackToPayload reports paused and stopped states", () => {
  const paused = core.spotifyPlaybackToPayload({
    currently_playing_type: "track",
    is_playing: false,
    item: { name: "X", artists: [], album: { images: [] } }
  });
  assert.equal(paused.state, "paused");

  const ad = core.spotifyPlaybackToPayload({ currently_playing_type: "ad", item: null });
  assert.equal(ad.state, "stopped");
  assert.equal(ad.track, null);
});

test("spotifyPlaybackToPayload falls back when fields are missing", () => {
  const payload = core.spotifyPlaybackToPayload({
    currently_playing_type: "track",
    is_playing: true,
    item: { artists: [], album: { images: [] } }
  });
  assert.equal(payload.track.title, "Unknown Track");
  assert.equal(payload.track.artist, "Unknown Artist");
});

test("lastfmCacheKey is lowercased and collision-resistant", () => {
  assert.equal(core.lastfmCacheKey("Artist", "Title"), `artist\u0000title`);
  // The separator prevents "a b"/"c" colliding with "a"/"b c".
  assert.notEqual(core.lastfmCacheKey("a b", "c"), core.lastfmCacheKey("a", "b c"));
});

test("encodeData/decodeData round-trip preserves data including unicode", () => {
  const value = { a: 1, b: "café — й 🎵", nested: { list: [1, 2, 3] } };
  assert.deepEqual(core.decodeData(core.encodeData(value)), value);
});

test("encodeData produces URL-safe base64 (no +, /, or =)", () => {
  const encoded = core.encodeData({ padding: "????????" });
  assert.doesNotMatch(encoded, /[+/=]/);
});
