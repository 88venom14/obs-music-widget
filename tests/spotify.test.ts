import assert from "node:assert/strict";
import test from "node:test";
import { buildSpotifyAuthUrl, clearSpotifyAccessTokenForTests, exchangeCodeForTokens, pollSpotify, spotifyPlaybackToPayload } from "../src/spotify";
import type { SpotifyCurrentlyPlayingResponse, TrackPayload } from "../src/types";

const credentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:3000/auth/callback",
  refreshToken: "refresh-token"
};

const previousPayload: TrackPayload = {
  state: "playing",
  track: {
    title: "Previous",
    artist: "Artist",
    album: "Album",
    artUrl: "",
    trackUrl: "",
    scrobbledAt: null
  },
  timestamp: 100
};

function makePlayback(overrides: Partial<SpotifyCurrentlyPlayingResponse> = {}): SpotifyCurrentlyPlayingResponse {
  return {
    timestamp: 1_000,
    progress_ms: 40_000,
    is_playing: true,
    currently_playing_type: "track",
    item: {
      type: "track",
      name: "Spotify Song",
      external_urls: {
        spotify: "https://open.spotify.com/track/123"
      },
      artists: [{ name: "Artist One" }, { name: "Artist Two" }],
      album: {
        name: "Spotify Album",
        images: [
          { url: "small.jpg", height: 64, width: 64 },
          { url: "large.jpg", height: 640, width: 640 }
        ]
      }
    },
    ...overrides
  };
}

test("buildSpotifyAuthUrl includes code flow parameters and scope", () => {
  const url = new URL(buildSpotifyAuthUrl(credentials, "state-token"));

  assert.equal(url.origin + url.pathname, "https://accounts.spotify.com/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), credentials.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), credentials.redirectUri);
  assert.equal(url.searchParams.get("scope"), "user-read-currently-playing");
  assert.equal(url.searchParams.get("state"), "state-token");
});

test("spotifyPlaybackToPayload returns playing track payload", () => {
  const payload = spotifyPlaybackToPayload(makePlayback(), 1_000_000);

  assert.equal(payload.state, "playing");
  assert.equal(payload.track?.title, "Spotify Song");
  assert.equal(payload.track?.artist, "Artist One, Artist Two");
  assert.equal(payload.track?.album, "Spotify Album");
  assert.equal(payload.track?.artUrl, "large.jpg");
  assert.equal(payload.track?.trackUrl, "https://open.spotify.com/track/123");
});

test("spotifyPlaybackToPayload returns paused when Spotify reports is_playing false", () => {
  const payload = spotifyPlaybackToPayload(makePlayback({ is_playing: false }), 1_000_000);

  assert.equal(payload.state, "paused");
  assert.equal(payload.track?.title, "Spotify Song");
});

test("spotifyPlaybackToPayload returns stopped for ads or missing track item", () => {
  assert.equal(spotifyPlaybackToPayload(makePlayback({ currently_playing_type: "ad", item: null }), 1_000_000).state, "stopped");
  assert.equal(spotifyPlaybackToPayload(makePlayback({ item: null }), 1_000_000).track, null);
});

test("exchangeCodeForTokens posts authorization code grant", async () => {
  const token = await exchangeCodeForTokens(credentials, "auth-code", async (_input, init) => {
    assert.equal(init?.method, "POST");
    assert.match(String(init?.body), /grant_type=authorization_code/);
    assert.match(String(init?.body), /code=auth-code/);

    return new Response(
      JSON.stringify({
        access_token: "access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "new-refresh-token"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });

  assert.equal(token?.refresh_token, "new-refresh-token");
});

test("pollSpotify keeps previous payload when refresh token is missing", async () => {
  clearSpotifyAccessTokenForTests();

  const payload = await pollSpotify({
    credentials: { ...credentials, refreshToken: "" },
    previousPayload,
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    }
  });

  assert.deepEqual(payload, previousPayload);
});

test("pollSpotify returns stopped when Spotify returns 204", async () => {
  clearSpotifyAccessTokenForTests();

  let calls = 0;
  const payload = await pollSpotify({
    credentials,
    previousPayload,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ access_token: "access-token", token_type: "Bearer", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 204 });
    }
  });

  assert.equal(payload.state, "stopped");
  assert.equal(payload.track, null);
});

test("pollSpotify keeps previous payload on rate limits", async () => {
  clearSpotifyAccessTokenForTests();

  let calls = 0;
  const payload = await pollSpotify({
    credentials,
    previousPayload,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ access_token: "access-token", token_type: "Bearer", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ error: { status: 429 } }), {
        status: 429,
        headers: { "Retry-After": "2" }
      });
    }
  });

  assert.deepEqual(payload, previousPayload);
});
