import { LASTFM_ENDPOINT, LASTFM_FALLBACK_DURATION_MS, LASTFM_DURATION_CACHE_LIMIT } from "../core/config.js";
import { state } from "../core/state.js";
import { lastfmCacheKey } from "../core/core.js";

function rememberLastfmDuration(cacheKey, durationMs) {
  const cache = state.lastfmDurationCache;
  if (!(cacheKey in cache)) {
    const keys = Object.keys(cache);
    if (keys.length >= LASTFM_DURATION_CACHE_LIMIT) {
      delete cache[keys[0]];
    }
  }
  cache[cacheKey] = durationMs;
  return durationMs;
}

async function fetchLastfmDuration(config, artist, title) {
  const cacheKey = lastfmCacheKey(artist, title);
  if (state.lastfmDurationCache[cacheKey]) {
    return state.lastfmDurationCache[cacheKey];
  }

  const url = new URL(LASTFM_ENDPOINT);
  url.searchParams.set("method", "track.getInfo");
  url.searchParams.set("artist", artist);
  url.searchParams.set("track", title);
  url.searchParams.set("api_key", config.apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("autocorrect", "1");

  try {
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const duration = Number(data?.track?.duration || 0);
    return rememberLastfmDuration(cacheKey, duration > 0 ? duration : LASTFM_FALLBACK_DURATION_MS);
  } catch (_error) {
    return LASTFM_FALLBACK_DURATION_MS;
  }
}

function applyLastfmEstimatedProgress(payload, slotName) {
  if (!payload.track?.durationMs) {
    return payload;
  }

  const slot = state.lastfmProgress[slotName] || state.lastfmProgress.preview;
  const trackKey = `${payload.track.title}\u0000${payload.track.artist}\u0000${payload.track.album}`;
  if (slot.trackKey !== trackKey || !slot.startedAt) {
    slot.trackKey = trackKey;
    slot.startedAt = Date.now();
  }

  payload.track.progressMs = Math.min(Date.now() - slot.startedAt, payload.track.durationMs);
  payload.track.sampledAt = Date.now();
  return payload;
}

export async function fetchLastfmTrack(config, slotName = "preview") {
  const url = new URL(LASTFM_ENDPOINT);
  url.searchParams.set("method", "user.getrecenttracks");
  url.searchParams.set("user", config.username);
  url.searchParams.set("api_key", config.apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Last.fm request failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Last.fm: ${data.message || `error ${data.error}`}`);
  }

  const rawTracks = data?.recenttracks?.track;
  const track = Array.isArray(rawTracks) ? rawTracks[0] : rawTracks;
  if (!track) {
    state.lastfmProgress[slotName].trackKey = "";
    return { state: "stopped", track: null };
  }

  const isNowPlaying = track["@attr"]?.nowplaying === "true";
  if (!isNowPlaying) {
    state.lastfmProgress[slotName].trackKey = "";
    return { state: "stopped", track: null };
  }

  const images = Array.isArray(track.image) ? track.image : [];
  const artUrl = [...images].reverse().find((image) => image?.["#text"])?.["#text"] || "";
  const title = track.name || "Unknown Track";
  const artist = track.artist?.["#text"] || track.artist?.name || "Unknown Artist";
  const album = track.album?.["#text"] || "";
  const durationMs = await fetchLastfmDuration(config, artist, title);

  return applyLastfmEstimatedProgress({
    state: "playing",
    track: {
      title,
      artist,
      album,
      artUrl,
      trackUrl: track.url || "",
      durationMs
    }
  }, slotName);
}
