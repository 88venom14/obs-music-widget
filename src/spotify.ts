import { logger } from "./logger";
import type { SpotifyCurrentlyPlayingResponse, SpotifyTokenResponse, SpotifyTrackItem, TrackPayload } from "./types";

const ACCOUNTS_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SPOTIFY_AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
const CURRENTLY_PLAYING_ENDPOINT = "https://api.spotify.com/v1/me/player/currently-playing";
const REQUEST_TIMEOUT_MS = 8000;
const AUTH_SCOPE = "user-read-currently-playing";

export const STOPPED_PAYLOAD: TrackPayload = {
  state: "stopped",
  track: null,
  timestamp: Date.now()
};

export interface SpotifyCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
}

export interface SpotifyPollOptions {
  credentials: SpotifyCredentials;
  previousPayload: TrackPayload;
  fetchImpl?: typeof fetch;
}

interface AccessTokenState {
  value: string;
  expiresAt: number;
}

let accessToken: AccessTokenState | null = null;

export function clearSpotifyAccessTokenForTests(): void {
  accessToken = null;
}

function hasRequiredCredentials(credentials: SpotifyCredentials, requireRefreshToken: boolean): boolean {
  const baseReady =
    Boolean(credentials.clientId) &&
    Boolean(credentials.clientSecret) &&
    Boolean(credentials.redirectUri) &&
    credentials.clientId !== "YOUR_SPOTIFY_CLIENT_ID" &&
    credentials.clientSecret !== "YOUR_SPOTIFY_CLIENT_SECRET";

  return requireRefreshToken ? baseReady && Boolean(credentials.refreshToken) : baseReady;
}

function basicAuthHeader(credentials: Pick<SpotifyCredentials, "clientId" | "clientSecret">): string {
  return `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`;
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: URL | string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestToken(body: URLSearchParams, credentials: SpotifyCredentials, fetchImpl: typeof fetch): Promise<SpotifyTokenResponse | null> {
  try {
    const response = await fetchWithTimeout(fetchImpl, ACCOUNTS_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(credentials),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      logger.error(`Spotify token request returned HTTP ${response.status}.`);
      return null;
    }

    return (await response.json()) as SpotifyTokenResponse;
  } catch (error) {
    logger.error("Spotify token request failed.", error);
    return null;
  }
}

export function buildSpotifyAuthUrl(credentials: SpotifyCredentials, state: string): string {
  const url = new URL(SPOTIFY_AUTHORIZE_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("scope", AUTH_SCOPE);
  url.searchParams.set("redirect_uri", credentials.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForTokens(
  credentials: SpotifyCredentials,
  code: string,
  fetchImpl: typeof fetch = fetch
): Promise<SpotifyTokenResponse | null> {
  if (!hasRequiredCredentials(credentials, false)) {
    logger.warn("Spotify client ID, client secret, or redirect URI is missing.");
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: credentials.redirectUri
  });

  const token = await requestToken(body, credentials, fetchImpl);
  if (token) {
    accessToken = {
      value: token.access_token,
      expiresAt: Date.now() + Math.max(token.expires_in - 60, 1) * 1000
    };
  }

  return token;
}

async function refreshAccessToken(credentials: SpotifyCredentials, fetchImpl: typeof fetch): Promise<string | null> {
  if (!hasRequiredCredentials(credentials, true)) {
    logger.warn("Spotify credentials are incomplete. Visit /auth/login after filling .env.");
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken
  });

  const token = await requestToken(body, credentials, fetchImpl);
  if (!token) {
    return null;
  }

  accessToken = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max(token.expires_in - 60, 1) * 1000
  };

  return accessToken.value;
}

async function getAccessToken(credentials: SpotifyCredentials, fetchImpl: typeof fetch): Promise<string | null> {
  if (accessToken && accessToken.expiresAt > Date.now()) {
    return accessToken.value;
  }

  return refreshAccessToken(credentials, fetchImpl);
}

function chooseAlbumArt(track: SpotifyTrackItem): string {
  return [...track.album.images]
    .sort((left, right) => (right.width ?? 0) - (left.width ?? 0))
    .find((image) => image.url.trim() !== "")?.url ?? "";
}

export function spotifyPlaybackToPayload(playback: SpotifyCurrentlyPlayingResponse, now = Date.now()): TrackPayload {
  if (playback.currently_playing_type !== "track" || !playback.item) {
    return {
      state: "stopped",
      track: null,
      timestamp: now
    };
  }

  return {
    state: playback.is_playing ? "playing" : "paused",
    track: {
      title: playback.item.name || "Unknown Track",
      artist: playback.item.artists.map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown Artist",
      album: playback.item.album.name || "",
      artUrl: chooseAlbumArt(playback.item),
      trackUrl: playback.item.external_urls?.spotify || "",
      scrobbledAt: null
    },
    timestamp: now
  };
}

async function fetchCurrentPlayback(token: string, fetchImpl: typeof fetch): Promise<Response> {
  const url = new URL(CURRENTLY_PLAYING_ENDPOINT);
  url.searchParams.set("additional_types", "track");

  return fetchWithTimeout(fetchImpl, url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function pollSpotify(options: SpotifyPollOptions): Promise<TrackPayload> {
  const { credentials, previousPayload, fetchImpl = fetch } = options;
  let token = await getAccessToken(credentials, fetchImpl);

  if (!token) {
    return previousPayload;
  }

  try {
    let response = await fetchCurrentPlayback(token, fetchImpl);

    if (response.status === 401) {
      accessToken = null;
      token = await refreshAccessToken(credentials, fetchImpl);
      if (!token) {
        return previousPayload;
      }
      response = await fetchCurrentPlayback(token, fetchImpl);
    }

    if (response.status === 204) {
      return {
        state: "stopped",
        track: null,
        timestamp: Date.now()
      };
    }

    if (response.status === 429) {
      logger.warn(`Spotify rate limited polling. Retry-After: ${response.headers.get("retry-after") || "unknown"} seconds.`);
      return previousPayload;
    }

    if (!response.ok) {
      logger.error(`Spotify currently-playing returned HTTP ${response.status}. Keeping previous state.`);
      return previousPayload;
    }

    return spotifyPlaybackToPayload((await response.json()) as SpotifyCurrentlyPlayingResponse);
  } catch (error) {
    logger.error("Spotify polling failed. Keeping previous state.", error);
    return previousPayload;
  }
}
