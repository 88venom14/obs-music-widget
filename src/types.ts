export type PlayerState = "playing" | "paused" | "stopped";

export interface TrackPayload {
  state: PlayerState;
  track: {
    title: string;
    artist: string;
    album: string;
    artUrl: string;
    trackUrl: string;
    scrobbledAt: number | null;
  } | null;
  timestamp: number;
}

export interface AppConfig {
  spotify: {
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    refresh_token: string;
  };
  server: {
    port: number;
    polling_interval_ms: number;
    hide_on_pause: boolean;
  };
  theme: Record<string, string>;
}

export interface PublicConfig {
  server: {
    hide_on_pause: boolean;
  };
  theme: Record<string, string>;
}

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: "Bearer";
  scope?: string;
  expires_in: number;
  refresh_token?: string;
}

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyTrackItem {
  type: "track";
  name: string;
  external_urls?: {
    spotify?: string;
  };
  artists: Array<{
    name: string;
  }>;
  album: {
    name: string;
    images: SpotifyImage[];
  };
}

export interface SpotifyCurrentlyPlayingResponse {
  timestamp: number;
  progress_ms: number | null;
  is_playing: boolean;
  currently_playing_type: "track" | "episode" | "ad" | "unknown";
  item: SpotifyTrackItem | null;
}
