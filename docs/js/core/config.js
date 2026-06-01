// App-wide constants: endpoints, storage keys, polling/cache limits, and the
// inline placeholder cover art. No imports (leaf module).

export const SITE_CONFIG = window.OBS_SPOTIFY_WIDGET_CONFIG || {};
export const CLIENT_ID_PLACEHOLDER = "PUT_YOUR_SPOTIFY_CLIENT_ID_HERE";
export const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
export const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
export const CURRENTLY_PLAYING_ENDPOINT = "https://api.spotify.com/v1/me/player/currently-playing?additional_types=track";
export const LASTFM_ENDPOINT = "https://ws.audioscrobbler.com/2.0/";
export const SCOPE = "user-read-currently-playing";
export const PROVIDER_STORAGE_KEY = "obs_spotify_widget_provider";
export const STORAGE_KEY = "obs_spotify_widget_auth";
export const CLIENT_ID_STORAGE_KEY = "obs_spotify_widget_client_id";
export const LASTFM_STORAGE_KEY = "obs_spotify_widget_lastfm";
export const VERIFIER_KEY = "obs_spotify_widget_pkce_verifier";
export const STATE_KEY = "obs_spotify_widget_oauth_state";
export const REDIRECT_KEY = "obs_spotify_widget_redirect_uri";
export const POLLING_INTERVAL_MS = 2000;
export const LASTFM_FALLBACK_DURATION_MS = 180000;
export const LASTFM_DURATION_CACHE_LIMIT = 200;
export const PLACEHOLDER_ART =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="18" fill="#202024"/><path fill="#1db954" d="M80 25v54.8A17 17 0 1 1 70 64.3V39.6l-31 6.8v39.4A17 17 0 1 1 29 70.3V38.6L80 25z"/></svg>'
  );
export const customCssStyleId = "custom-widget-css";
