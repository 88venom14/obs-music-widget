(function () {
  const SITE_CONFIG = window.OBS_SPOTIFY_WIDGET_CONFIG || {};
  const CLIENT_ID_PLACEHOLDER = "PUT_YOUR_SPOTIFY_CLIENT_ID_HERE";
  const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
  const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
  const CURRENTLY_PLAYING_ENDPOINT = "https://api.spotify.com/v1/me/player/currently-playing?additional_types=track";
  const LASTFM_ENDPOINT = "https://ws.audioscrobbler.com/2.0/";
  const SCOPE = "user-read-currently-playing";
  const PROVIDER_STORAGE_KEY = "obs_spotify_widget_provider";
  const STORAGE_KEY = "obs_spotify_widget_auth";
  const CLIENT_ID_STORAGE_KEY = "obs_spotify_widget_client_id";
  const LASTFM_STORAGE_KEY = "obs_spotify_widget_lastfm";
  const VERIFIER_KEY = "obs_spotify_widget_pkce_verifier";
  const STATE_KEY = "obs_spotify_widget_oauth_state";
  const REDIRECT_KEY = "obs_spotify_widget_redirect_uri";
  const POLLING_INTERVAL_MS = 3000;
  const LASTFM_FALLBACK_DURATION_MS = 180000;
  const PLACEHOLDER_ART =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="18" fill="#202024"/><path fill="#1db954" d="M80 25v54.8A17 17 0 1 1 70 64.3V39.6l-31 6.8v39.4A17 17 0 1 1 29 70.3V38.6L80 25z"/></svg>'
    );

  const state = {
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
    }
  };

  const controls = {};
  const preview = {};
  const widget = {};

  function getSiteClientId() {
    return String(SITE_CONFIG.spotifyClientId || "").trim();
  }

  function getStoredClientId() {
    return String(localStorage.getItem(CLIENT_ID_STORAGE_KEY) || "").trim();
  }

  function getStoredProvider() {
    const provider = localStorage.getItem(PROVIDER_STORAGE_KEY);
    return provider === "lastfm" ? "lastfm" : "spotify";
  }

  function getClientId() {
    return getStoredClientId() || getSiteClientId();
  }

  function isUsableClientId(clientId) {
    return Boolean(clientId) && clientId !== CLIENT_ID_PLACEHOLDER;
  }

  function isClientConfigured() {
    return isUsableClientId(getClientId());
  }

  function loadLastfmConfig() {
    try {
      const raw = localStorage.getItem(LASTFM_STORAGE_KEY);
      const config = raw ? JSON.parse(raw) : null;
      if (!config?.username || !config?.apiKey) {
        return null;
      }
      return {
        username: String(config.username).trim(),
        apiKey: String(config.apiKey).trim()
      };
    } catch (_error) {
      return null;
    }
  }

  function isLastfmConfigured() {
    return Boolean(state.lastfmConfig?.username && state.lastfmConfig?.apiKey);
  }

  function getRedirectUri() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
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

  function randomBase64Url(byteCount) {
    const bytes = new Uint8Array(byteCount);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }

  async function sha256Base64Url(value) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return bytesToBase64Url(new Uint8Array(hash));
  }

  async function beginSpotifyLogin() {
    if (!isClientConfigured()) {
      showWarning("Сначала вставьте свой Spotify Client ID и добавьте показанный Redirect URI в настройки Spotify app.");
      return;
    }

    const verifier = randomBase64Url(64);
    const challenge = await sha256Base64Url(verifier);
    const oauthState = randomBase64Url(16);
    const redirectUri = getRedirectUri();

    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, oauthState);
    sessionStorage.setItem(REDIRECT_KEY, redirectUri);

    const url = new URL(AUTHORIZE_ENDPOINT);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", getClientId());
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", oauthState);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", challenge);

    window.location.assign(url.toString());
  }

  async function requestToken(body) {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw await makeSpotifyError(response, "Spotify token request");
    }

    return response.json();
  }

  async function readSpotifyError(response) {
    try {
      const body = await response.clone().json();
      return body?.error?.message || body?.error_description || "";
    } catch (_jsonError) {
      try {
        return (await response.clone().text()).trim();
      } catch (_textError) {
        return "";
      }
    }
  }

  async function makeSpotifyError(response, area) {
    const details = await readSpotifyError(response);
    if (response.status === 403) {
      return new Error(
        `${area} вернул HTTP 403. Client secret для GitHub Pages не нужен. Если вы используете свой Client ID, проверьте, что аккаунт владельца Spotify app имеет Premium, Redirect URI добавлен точно, а затем выйдите и войдите заново.${details ? ` Spotify: ${details}` : ""}`
      );
    }

    return new Error(`${area} failed with HTTP ${response.status}${details ? `: ${details}` : ""}`);
  }

  function saveAuth(auth) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    state.previewAuth = auth;
  }

  function loadAuth() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const auth = raw ? JSON.parse(raw) : null;
      if (auth?.clientId && (!isClientConfigured() || auth.clientId !== getClientId())) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return auth;
    } catch (_error) {
      return null;
    }
  }

  function retryAfterToMs(response) {
    const retryAfter = response.headers.get("retry-after");
    if (!retryAfter) {
      return POLLING_INTERVAL_MS;
    }

    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.max(seconds * 1000, POLLING_INTERVAL_MS);
    }

    const retryAt = Date.parse(retryAfter);
    return Number.isNaN(retryAt) ? POLLING_INTERVAL_MS : Math.max(retryAt - Date.now(), POLLING_INTERVAL_MS);
  }

  function resetAuth() {
    localStorage.removeItem(STORAGE_KEY);
    state.previewAuth = null;
    state.previewTrackKey = "";
  }

  function saveUserClientId() {
    const clientId = controls.clientIdInput.value.trim();
    if (!isUsableClientId(clientId)) {
      showWarning("Вставьте Client ID из Spotify Developer Dashboard. Client Secret сюда не нужен.");
      return;
    }

    const previousClientId = getClientId();
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);

    if (previousClientId !== clientId) {
      resetAuth();
    }

    controls.clientIdInput.value = clientId;
    updateAuthUi();
    updateWidgetUrl();
    hideWarning();
  }

  function saveLastfmConfig() {
    const config = {
      username: controls.lastfmUsername.value.trim(),
      apiKey: controls.lastfmApiKey.value.trim()
    };

    if (!config.username || !config.apiKey) {
      showWarning("Укажите Last.fm username и Last.fm API key.");
      return;
    }

    localStorage.setItem(LASTFM_STORAGE_KEY, JSON.stringify(config));
    state.lastfmConfig = config;
    setProvider("lastfm");
    updateWidgetUrl();
    void refreshPreview();
    hideWarning();
  }

  function setProvider(provider) {
    state.provider = provider === "lastfm" ? "lastfm" : "spotify";
    localStorage.setItem(PROVIDER_STORAGE_KEY, state.provider);
    state.previewAuth = state.provider === "spotify" ? loadAuth() : null;
    updateProviderUi();
    updateAuthUi();
    updateWidgetUrl();
  }

  function updateProviderUi() {
    const isLastfm = state.provider === "lastfm";
    controls.providerSpotify.checked = !isLastfm;
    controls.providerLastfm.checked = isLastfm;
    controls.spotifyProviderSettings.classList.toggle("hidden", isLastfm);
    controls.lastfmProviderSettings.classList.toggle("hidden", !isLastfm);
  }

  async function handleAuthCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      showWarning(`Spotify вернул ошибку авторизации: ${error}`);
      history.replaceState({}, "", getRedirectUri());
      return;
    }

    if (!code) {
      return;
    }

    const expectedState = sessionStorage.getItem(STATE_KEY);
    const actualState = url.searchParams.get("state");
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    const redirectUri = sessionStorage.getItem(REDIRECT_KEY) || getRedirectUri();

    if (!expectedState || expectedState !== actualState || !verifier) {
      showWarning("OAuth-сессия не совпала. Попробуйте войти через Spotify еще раз.");
      history.replaceState({}, "", getRedirectUri());
      return;
    }

    try {
      const token = await requestToken(
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: getClientId(),
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier
        })
      );

      if (!token.refresh_token) {
        throw new Error("Spotify did not return refresh_token");
      }

      saveAuth({
        clientId: getClientId(),
        refreshToken: token.refresh_token,
        accessToken: token.access_token,
        expiresAt: Date.now() + Math.max(Number(token.expires_in || 3600) - 60, 1) * 1000
      });

      sessionStorage.removeItem(VERIFIER_KEY);
      sessionStorage.removeItem(STATE_KEY);
      sessionStorage.removeItem(REDIRECT_KEY);
      history.replaceState({}, "", redirectUri);
      hideWarning();
    } catch (tokenError) {
      showWarning(`Не удалось получить Spotify token: ${tokenError.message}`);
    }
  }

  async function refreshAccessToken(auth) {
    const token = await requestToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: auth.clientId,
        refresh_token: auth.refreshToken
      })
    );

    const nextAuth = {
      ...auth,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + Math.max(Number(token.expires_in || 3600) - 60, 1) * 1000
    };

    return nextAuth;
  }

  async function getAccessToken(auth, persist) {
    if (auth.accessToken && auth.expiresAt > Date.now()) {
      return auth;
    }

    const nextAuth = await refreshAccessToken(auth);
    if (persist) {
      saveAuth(nextAuth);
      updateWidgetUrl();
    }
    return nextAuth;
  }

  async function fetchCurrentTrack(auth, persist) {
    let nextAuth = await getAccessToken(auth, persist);
    let response = await fetch(CURRENTLY_PLAYING_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${nextAuth.accessToken}`
      }
    });

    if (response.status === 401) {
      nextAuth = await refreshAccessToken(nextAuth);
      if (persist) {
        saveAuth(nextAuth);
        updateWidgetUrl();
      }
      response = await fetch(CURRENTLY_PLAYING_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${nextAuth.accessToken}`
        }
      });
    }

    if (response.status === 204) {
      return { state: "stopped", track: null, auth: nextAuth };
    }

    if (response.status === 429) {
      return { state: "unchanged", track: null, auth: nextAuth, retryAfterMs: retryAfterToMs(response) };
    }

    if (!response.ok) {
      throw await makeSpotifyError(response, "Spotify currently-playing");
    }

    const playback = await response.json();
    return { ...spotifyPlaybackToPayload(playback), auth: nextAuth };
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
      state.lastfmDurationCache[cacheKey] = duration > 0 ? duration : LASTFM_FALLBACK_DURATION_MS;
      return state.lastfmDurationCache[cacheKey];
    } catch (_error) {
      state.lastfmDurationCache[cacheKey] = LASTFM_FALLBACK_DURATION_MS;
      return state.lastfmDurationCache[cacheKey];
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

  async function fetchLastfmTrack(config, slotName = "preview") {
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

  function hexToRgba(hex, alpha) {
    const value = hex.replace("#", "");
    const red = parseInt(value.slice(0, 2), 16);
    const green = parseInt(value.slice(2, 4), 16);
    const blue = parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function getSettings() {
    return {
      bgColor: controls.bgColor.value,
      bgAlpha: Number(controls.bgAlpha.value),
      textColor: controls.textColor.value,
      mutedColor: controls.mutedColor.value,
      accentColor: controls.accentColor.value,
      widgetWidth: Number(controls.widgetWidth.value),
      widgetHeight: Number(controls.widgetHeight.value),
      widgetRadius: Number(controls.widgetRadius.value),
      fontScale: Number(controls.fontScale.value),
      progressHeight: Number(controls.progressHeight.value),
      backdropBlur: Number(controls.backdropBlur.value),
      hideOnPause: controls.hideOnPause.checked,
      showArt: controls.showArt.checked,
      showVisualizer: controls.showVisualizer.checked,
      showProgress: controls.showProgress.checked,
      showTime: controls.showTime.checked
    };
  }

  function applySettings(settings) {
    document.documentElement.style.setProperty("--bg-color", hexToRgba(settings.bgColor, settings.bgAlpha));
    document.documentElement.style.setProperty("--text-main-color", settings.textColor);
    document.documentElement.style.setProperty("--text-muted-color", settings.mutedColor);
    document.documentElement.style.setProperty("--accent-color", settings.accentColor);
    document.documentElement.style.setProperty("--widget-width", `${settings.widgetWidth}px`);
    document.documentElement.style.setProperty("--widget-height", `${settings.widgetHeight}px`);
    document.documentElement.style.setProperty("--border-radius-widget", `${settings.widgetRadius}px`);
    document.documentElement.style.setProperty("--border-radius-art", `${Math.max(settings.widgetRadius - 4, 0)}px`);
    document.documentElement.style.setProperty("--font-scale", String(settings.fontScale));
    document.documentElement.style.setProperty("--progress-height", `${settings.progressHeight}px`);
    document.documentElement.style.setProperty("--backdrop-blur", `${settings.backdropBlur}px`);
  }

  function setWidgetVisible(root, visible) {
    root.classList.toggle("widget--visible", visible);
    root.classList.toggle("widget--hidden", !visible);
  }

  function setAlbumArt(image, artUrl) {
    const nextSrc = artUrl && artUrl.trim() ? artUrl : PLACEHOLDER_ART;
    if (image.src !== nextSrc) {
      image.src = nextSrc;
    }
  }

  function updateMarquee(textElement, wrapperElement) {
    textElement.classList.remove("is-marquee");
    textElement.style.removeProperty("--marquee-offset");

    requestAnimationFrame(() => {
      const overflow = textElement.scrollWidth - wrapperElement.clientWidth;
      if (overflow > 2) {
        textElement.style.setProperty("--marquee-offset", `-${overflow + 16}px`);
        textElement.classList.add("is-marquee");
      }
    });
  }

  function formatTime(ms) {
    const totalSeconds = Math.max(Math.floor(Number(ms || 0) / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function getProgressMs(payload) {
    const durationMs = Number(payload.track?.durationMs || 0);
    if (!durationMs) {
      return 0;
    }

    const sampledAt = Number(payload.track?.sampledAt || Date.now());
    const baseProgress = Number(payload.track?.progressMs || 0);
    const liveOffset = payload.state === "playing" ? Date.now() - sampledAt : 0;
    return Math.min(Math.max(baseProgress + liveOffset, 0), durationMs);
  }

  function updateWidgetOptions(target, settings, payload) {
    const hasProgress = Boolean(payload?.track?.durationMs);
    target.root.classList.toggle("widget--no-art", !settings.showArt);
    target.root.classList.toggle("widget--no-visualizer", !settings.showVisualizer);
    target.root.classList.toggle("widget--no-progress", !settings.showProgress || !hasProgress);
    target.root.classList.toggle("widget--no-time", !settings.showTime || !hasProgress);
  }

  function updateProgress(target, payload) {
    if (!target.progressFill || !target.time || !payload.track?.durationMs) {
      return;
    }

    const durationMs = Number(payload.track.durationMs);
    const progressMs = getProgressMs(payload);
    const percent = durationMs ? (progressMs / durationMs) * 100 : 0;
    target.progressFill.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
    target.time.textContent = `${formatTime(progressMs)} / ${formatTime(durationMs)}`;
  }

  function renderWidget(target, payload, settings, trackKeyName) {
    updateWidgetOptions(target, settings, payload);

    if (payload.state === "unchanged") {
      return;
    }

    if (payload.state === "stopped" || (payload.state === "paused" && settings.hideOnPause)) {
      target.visualizer.classList.add("paused");
      setWidgetVisible(target.root, false);
      return;
    }

    if (!payload.track) {
      setWidgetVisible(target.root, false);
      return;
    }

    const nextTrackKey = `${payload.track.title}\u0000${payload.track.artist}\u0000${payload.track.album}\u0000${payload.track.artUrl}`;
    if (state[trackKeyName] !== nextTrackKey) {
      state[trackKeyName] = nextTrackKey;
      target.info.classList.add("fading");
      target.artContainer.classList.add("fading");
      window.setTimeout(() => {
        setAlbumArt(target.art, payload.track.artUrl);
        target.title.textContent = payload.track.title;
        target.artist.textContent = payload.track.artist;
        updateMarquee(target.title, target.titleWrapper);
        updateMarquee(target.artist, target.artistWrapper);
        updateProgress(target, payload);
        target.info.classList.remove("fading");
        target.artContainer.classList.remove("fading");
      }, 180);
    } else {
      updateProgress(target, payload);
    }

    setWidgetVisible(target.root, true);
    target.visualizer.classList.toggle("paused", payload.state !== "playing");
  }

  function renderMockPreview() {
    renderWidget(
      preview,
      {
        state: "playing",
        track: {
          title: "Midnight City",
          artist: "M83",
          album: "Hurry Up, We're Dreaming",
          artUrl: "",
          durationMs: 244000,
          progressMs: 78000,
          sampledAt: Date.now()
        }
      },
      getSettings(),
      "previewTrackKey"
    );
  }

  async function refreshPreview() {
    applySettings(getSettings());

    if (Date.now() < state.previewNextPollAt) {
      return;
    }

    if (state.provider === "lastfm") {
      if (!isLastfmConfigured()) {
        renderMockPreview();
        return;
      }

      try {
        const payload = await fetchLastfmTrack(state.lastfmConfig, "preview");
        renderWidget(preview, payload, getSettings(), "previewTrackKey");
        hideWarning();
      } catch (error) {
        showWarning(`Не удалось прочитать текущий трек Last.fm: ${error.message}`);
      }
      return;
    }

    if (!state.previewAuth) {
      renderMockPreview();
      return;
    }

    try {
      const payload = await fetchCurrentTrack(state.previewAuth, true);
      state.previewAuth = payload.auth;
      if (payload.retryAfterMs) {
        state.previewNextPollAt = Date.now() + payload.retryAfterMs;
      }
      renderWidget(preview, payload, getSettings(), "previewTrackKey");
      hideWarning();
    } catch (error) {
      showWarning(`Не удалось прочитать текущий трек Spotify: ${error.message}`);
    }
  }

  function getBaseWidgetUrl() {
    const url = new URL(window.location.href);
    url.search = "?widget=1";
    url.hash = "";
    return url.toString();
  }

  function updateWidgetUrl() {
    if (!controls.widgetUrl) {
      return;
    }

    if (state.provider === "lastfm") {
      if (!isLastfmConfigured()) {
        controls.widgetUrl.value = "Сначала укажите Last.fm username и API key.";
        controls.copyUrl.disabled = true;
        return;
      }

      const payload = {
        v: 2,
        provider: "lastfm",
        lastfm: state.lastfmConfig,
        settings: getSettings()
      };

      controls.widgetUrl.value = `${getBaseWidgetUrl()}#data=${encodeData(payload)}`;
      controls.copyUrl.disabled = false;
      return;
    }

    const auth = state.previewAuth;
    if (!auth?.refreshToken) {
      controls.widgetUrl.value = isClientConfigured() ? "Сначала войдите через Spotify." : "Сначала вставьте Spotify Client ID.";
      controls.copyUrl.disabled = true;
      return;
    }

    const payload = {
      v: 1,
      clientId: auth.clientId,
      refreshToken: auth.refreshToken,
      settings: getSettings()
    };

    controls.widgetUrl.value = `${getBaseWidgetUrl()}#data=${encodeData(payload)}`;
    controls.copyUrl.disabled = false;
  }

  function updateAuthUi() {
    if (state.provider === "lastfm") {
      const configured = isLastfmConfigured();
      controls.authStatus.textContent = configured ? "Last.fm подключен" : "Last.fm не настроен";
      controls.authStatus.classList.toggle("connected", configured);
      controls.login.disabled = true;
      controls.logout.disabled = true;
      return;
    }

    const connected = Boolean(state.previewAuth?.refreshToken);
    controls.authStatus.textContent = connected ? "Spotify подключен" : "Не подключено";
    controls.authStatus.classList.toggle("connected", connected);
    controls.login.disabled = !isClientConfigured();
    controls.logout.disabled = !connected;
  }

  function showWarning(message) {
    if (!controls.warning) {
      return;
    }
    controls.warning.textContent = message;
    controls.warning.classList.remove("hidden");
  }

  function hideWarning() {
    controls.warning?.classList.add("hidden");
  }

  function parseWidgetData() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const raw = params.get("data");
    return raw ? decodeData(raw) : null;
  }

  async function runWidgetMode() {
    document.body.classList.add("widget-mode");
    document.getElementById("app-shell").classList.add("hidden");
    document.getElementById("widget-root").classList.remove("hidden");

    let data;
    try {
      data = parseWidgetData();
    } catch (error) {
      console.error("Invalid widget URL data.", error);
      return;
    }

    if (data?.provider === "lastfm") {
      if (!data?.lastfm?.username || !data?.lastfm?.apiKey || !data?.settings) {
        console.error("Widget URL is missing Last.fm data.");
        return;
      }

      applySettings(data.settings);

      const tick = async () => {
        try {
          const payload = await fetchLastfmTrack(data.lastfm, "widget");
          renderWidget(widget, payload, data.settings, "widgetTrackKey");
        } catch (error) {
          console.error("Last.fm widget polling failed.", error);
        }
      };

      await tick();
      state.widgetTimer = window.setInterval(tick, POLLING_INTERVAL_MS);
      return;
    }

    if (!data?.clientId || !data?.refreshToken || !data?.settings) {
      console.error("Widget URL is missing Spotify token data.");
      return;
    }

    applySettings(data.settings);

    let auth = {
      clientId: data.clientId,
      refreshToken: data.refreshToken,
      accessToken: "",
      expiresAt: 0
    };

    const tick = async () => {
      if (Date.now() < state.widgetNextPollAt) {
        return;
      }

      try {
        const payload = await fetchCurrentTrack(auth, false);
        auth = payload.auth;
        if (payload.retryAfterMs) {
          state.widgetNextPollAt = Date.now() + payload.retryAfterMs;
        }
        renderWidget(widget, payload, data.settings, "widgetTrackKey");
      } catch (error) {
        console.error("Widget polling failed.", error);
      }
    };

    await tick();
    state.widgetTimer = window.setInterval(tick, POLLING_INTERVAL_MS);
  }

  function bindDashboard() {
    controls.authStatus = document.getElementById("auth-status");
    controls.warning = document.getElementById("setup-warning");
    controls.providerSpotify = document.getElementById("provider-spotify");
    controls.providerLastfm = document.getElementById("provider-lastfm");
    controls.spotifyProviderSettings = document.getElementById("spotify-provider-settings");
    controls.lastfmProviderSettings = document.getElementById("lastfm-provider-settings");
    controls.clientIdInput = document.getElementById("spotify-client-id");
    controls.saveClientId = document.getElementById("save-client-id");
    controls.redirectUri = document.getElementById("redirect-uri");
    controls.copyRedirectUri = document.getElementById("copy-redirect-uri");
    controls.lastfmUsername = document.getElementById("lastfm-username");
    controls.lastfmApiKey = document.getElementById("lastfm-api-key");
    controls.saveLastfm = document.getElementById("save-lastfm");
    controls.login = document.getElementById("spotify-login");
    controls.logout = document.getElementById("spotify-logout");
    controls.bgColor = document.getElementById("bg-color");
    controls.bgAlpha = document.getElementById("bg-alpha");
    controls.textColor = document.getElementById("text-color");
    controls.mutedColor = document.getElementById("muted-color");
    controls.accentColor = document.getElementById("accent-color");
    controls.widgetWidth = document.getElementById("widget-width");
    controls.widgetHeight = document.getElementById("widget-height");
    controls.widgetRadius = document.getElementById("widget-radius");
    controls.fontScale = document.getElementById("font-scale");
    controls.progressHeight = document.getElementById("progress-height");
    controls.backdropBlur = document.getElementById("backdrop-blur");
    controls.hideOnPause = document.getElementById("hide-on-pause");
    controls.showArt = document.getElementById("show-art");
    controls.showVisualizer = document.getElementById("show-visualizer");
    controls.showProgress = document.getElementById("show-progress");
    controls.showTime = document.getElementById("show-time");
    controls.widgetUrl = document.getElementById("widget-url");
    controls.copyUrl = document.getElementById("copy-url");
    controls.refreshPreview = document.getElementById("refresh-preview");

    preview.root = document.getElementById("preview-widget");
    preview.art = document.getElementById("preview-art");
    preview.artContainer = preview.root.querySelector(".art-container");
    preview.info = preview.root.querySelector(".track-info");
    preview.title = document.getElementById("preview-title");
    preview.artist = document.getElementById("preview-artist");
    preview.titleWrapper = preview.root.querySelector(".track-title-wrapper");
    preview.artistWrapper = preview.root.querySelector(".track-artist-wrapper");
    preview.visualizer = document.getElementById("preview-visualizer");
    preview.progressFill = document.getElementById("preview-progress-fill");
    preview.time = document.getElementById("preview-time");
    preview.art.addEventListener("error", () => {
      if (preview.art.src !== PLACEHOLDER_ART) {
        preview.art.src = PLACEHOLDER_ART;
      }
    });

    controls.clientIdInput.value = getStoredClientId() || (isUsableClientId(getSiteClientId()) ? getSiteClientId() : "");
    controls.redirectUri.value = getRedirectUri();
    controls.lastfmUsername.value = state.lastfmConfig?.username || "";
    controls.lastfmApiKey.value = state.lastfmConfig?.apiKey || "";

    controls.providerSpotify.addEventListener("change", () => {
      setProvider("spotify");
      void refreshPreview();
    });
    controls.providerLastfm.addEventListener("change", () => {
      setProvider("lastfm");
      void refreshPreview();
    });

    controls.saveClientId.addEventListener("click", saveUserClientId);
    controls.clientIdInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveUserClientId();
      }
    });
    controls.copyRedirectUri.addEventListener("click", async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(controls.redirectUri.value);
        } else {
          controls.redirectUri.focus();
          controls.redirectUri.select();
          document.execCommand("copy");
        }
        controls.copyRedirectUri.textContent = "Скопировано";
        window.setTimeout(() => {
          controls.copyRedirectUri.textContent = "Скопировать Redirect URI";
        }, 1400);
      } catch (_error) {
        controls.redirectUri.focus();
        controls.redirectUri.select();
        showWarning("Не удалось скопировать автоматически. Скопируйте выделенный Redirect URI вручную.");
      }
    });

    controls.saveLastfm.addEventListener("click", saveLastfmConfig);

    controls.login.addEventListener("click", beginSpotifyLogin);
    controls.logout.addEventListener("click", () => {
      resetAuth();
      updateAuthUi();
      updateWidgetUrl();
      renderMockPreview();
    });

    controls.copyUrl.addEventListener("click", async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(controls.widgetUrl.value);
        } else {
          controls.widgetUrl.focus();
          controls.widgetUrl.select();
          document.execCommand("copy");
        }
        controls.copyUrl.textContent = "Скопировано";
        window.setTimeout(() => {
          controls.copyUrl.textContent = "Скопировать ссылку";
        }, 1400);
      } catch (_error) {
        controls.widgetUrl.focus();
        controls.widgetUrl.select();
        showWarning("Не удалось скопировать автоматически. Скопируйте выделенную ссылку вручную.");
      }
    });

    controls.refreshPreview.addEventListener("click", refreshPreview);

    for (const input of [
      controls.bgColor,
      controls.bgAlpha,
      controls.textColor,
      controls.mutedColor,
      controls.accentColor,
      controls.widgetWidth,
      controls.widgetHeight,
      controls.widgetRadius,
      controls.fontScale,
      controls.progressHeight,
      controls.backdropBlur,
      controls.hideOnPause,
      controls.showArt,
      controls.showVisualizer,
      controls.showProgress,
      controls.showTime
    ]) {
      input.addEventListener("input", () => {
        applySettings(getSettings());
        updateWidgetUrl();
      });
    }
  }

  function bindWidgetMode() {
    widget.root = document.getElementById("widget");
    widget.art = document.getElementById("album-art");
    widget.artContainer = widget.root.querySelector(".art-container");
    widget.info = widget.root.querySelector(".track-info");
    widget.title = document.getElementById("track-title");
    widget.artist = document.getElementById("track-artist");
    widget.titleWrapper = widget.root.querySelector(".track-title-wrapper");
    widget.artistWrapper = widget.root.querySelector(".track-artist-wrapper");
    widget.visualizer = document.getElementById("visualizer");
    widget.progressFill = document.getElementById("progress-fill");
    widget.time = document.getElementById("track-time");
    widget.art.addEventListener("error", () => {
      if (widget.art.src !== PLACEHOLDER_ART) {
        widget.art.src = PLACEHOLDER_ART;
      }
    });
  }

  async function initDashboard() {
    state.provider = getStoredProvider();
    state.lastfmConfig = loadLastfmConfig();
    bindDashboard();
    updateProviderUi();

    if (state.provider === "spotify" && !isClientConfigured()) {
      showWarning("Вставьте свой Spotify Client ID и добавьте показанный Redirect URI в настройки Spotify app.");
    } else if (state.provider === "lastfm" && !isLastfmConfigured()) {
      showWarning("Укажите Last.fm username и API key, чтобы использовать режим без Spotify Premium.");
    }

    await handleAuthCallback();
    state.previewAuth = state.provider === "spotify" ? loadAuth() : null;
    updateAuthUi();
    applySettings(getSettings());
    updateWidgetUrl();
    await refreshPreview();

    state.previewTimer = window.setInterval(() => {
      void refreshPreview();
    }, POLLING_INTERVAL_MS);
  }

  window.addEventListener("DOMContentLoaded", () => {
    bindWidgetMode();

    const url = new URL(window.location.href);
    if (url.searchParams.get("widget") === "1") {
      void runWidgetMode();
      return;
    }

    void initDashboard();
  });
})();
