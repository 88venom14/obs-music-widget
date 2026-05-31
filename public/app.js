(function () {
  const RECONNECT_BASE_MS = 1000;
  const RECONNECT_MAX_MS = 30000;
  const PLACEHOLDER_ART =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="18" fill="#202024"/><path fill="#ff4500" d="M80 25v54.8A17 17 0 1 1 70 64.3V39.6l-31 6.8v39.4A17 17 0 1 1 29 70.3V38.6L80 25z"/></svg>'
    );

  const state = {
    hideOnPause: true,
    lastTrackKey: "",
    reconnectTimer: 0
  };

  const elements = {};

  function getWebSocketUrl() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.host}`;
  }

  function setWidgetVisible(visible) {
    elements.widget.classList.toggle("widget--visible", visible);
    elements.widget.classList.toggle("widget--hidden", !visible);
  }

  function applyTheme(theme) {
    if (!theme || typeof theme !== "object") {
      return;
    }

    for (const [key, value] of Object.entries(theme)) {
      if (key.startsWith("--") && typeof value === "string") {
        document.documentElement.style.setProperty(key, value);
      }
    }
  }

  async function loadConfig() {
    try {
      const response = await fetch("/config", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Config request failed with ${response.status}`);
      }

      const config = await response.json();
      state.hideOnPause = Boolean(config.server?.hide_on_pause);
      applyTheme(config.theme);
    } catch (error) {
      console.error("Could not load widget config.", error);
    }
  }

  function setAlbumArt(artUrl) {
    const nextSrc = artUrl && artUrl.trim() ? artUrl : PLACEHOLDER_ART;

    if (elements.albumArt.src !== nextSrc) {
      elements.albumArt.src = nextSrc;
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

  function updateTrack(track) {
    const nextTrackKey = `${track.title}\u0000${track.artist}\u0000${track.album}\u0000${track.artUrl}`;
    const changed = nextTrackKey !== state.lastTrackKey;

    if (!changed) {
      return;
    }

    state.lastTrackKey = nextTrackKey;
    elements.trackInfo.classList.add("fading");
    elements.artContainer.classList.add("fading");

    window.setTimeout(() => {
      setAlbumArt(track.artUrl);
      elements.trackTitle.textContent = track.title;
      elements.trackArtist.textContent = track.artist;

      updateMarquee(elements.trackTitle, elements.trackTitleWrapper);
      updateMarquee(elements.trackArtist, elements.trackArtistWrapper);

      elements.trackInfo.classList.remove("fading");
      elements.artContainer.classList.remove("fading");
    }, 180);
  }

  function isTrackPayload(payload) {
    return (
      payload &&
      typeof payload === "object" &&
      (payload.state === "playing" || payload.state === "paused" || payload.state === "stopped") &&
      typeof payload.timestamp === "number"
    );
  }

  function handlePayload(payload) {
    if (!isTrackPayload(payload)) {
      console.warn("Ignoring malformed WebSocket payload.", payload);
      return;
    }

    if (payload.state === "stopped" || (payload.state === "paused" && state.hideOnPause)) {
      elements.visualizer.classList.add("paused");
      setWidgetVisible(false);
      return;
    }

    if (!payload.track) {
      setWidgetVisible(false);
      return;
    }

    updateTrack(payload.track);
    setWidgetVisible(true);
    elements.visualizer.classList.toggle("paused", payload.state !== "playing");
  }

  function connect(attempt = 0) {
    const ws = new WebSocket(getWebSocketUrl());

    ws.addEventListener("message", (event) => {
      try {
        handlePayload(JSON.parse(event.data));
      } catch (error) {
        console.error("Invalid WebSocket message.", error);
      }
    });

    ws.addEventListener("open", () => {
      window.clearTimeout(state.reconnectTimer);
    });

    ws.addEventListener("close", () => {
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
      state.reconnectTimer = window.setTimeout(() => connect(attempt + 1), delay);
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  window.addEventListener("DOMContentLoaded", async () => {
    elements.widget = document.getElementById("widget");
    elements.albumArt = document.getElementById("album-art");
    elements.artContainer = document.querySelector(".art-container");
    elements.trackInfo = document.querySelector(".track-info");
    elements.trackTitle = document.getElementById("track-title");
    elements.trackArtist = document.getElementById("track-artist");
    elements.trackTitleWrapper = document.querySelector(".track-title-wrapper");
    elements.trackArtistWrapper = document.querySelector(".track-artist-wrapper");
    elements.visualizer = document.getElementById("visualizer");

    elements.albumArt.addEventListener("error", () => {
      if (elements.albumArt.src !== PLACEHOLDER_ART) {
        elements.albumArt.src = PLACEHOLDER_ART;
      }
    });

    setAlbumArt("");
    await loadConfig();
    connect();
  });
})();
