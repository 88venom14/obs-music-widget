// Dashboard mode: wires up all DOM controls/listeners and runs the setup flow
// (provider detection, OAuth callback, initial preview, polling).
import { state, controls, preview } from "../core/state.js";
import { PLACEHOLDER_ART, POLLING_INTERVAL_MS } from "../core/config.js";
import {
  getStoredClientId,
  getSiteClientId,
  isUsableClientId,
  getRedirectUri,
  getStoredProvider,
  loadLastfmConfig,
  isClientConfigured,
  isLastfmConfigured,
  saveUserClientId,
  saveLastfmConfig,
  setProvider,
  resetAuth,
  loadAuth
} from "../sources/credentials.js";
import { beginSpotifyLogin, handleAuthCallback } from "../sources/spotify.js";
import { getSettings, applySettings, syncWidgetSizeInputs } from "../widget/settings.js";
import { renderWidget, renderMockPreview, refreshPreview } from "../widget/widget-render.js";
import { updateWidgetUrl } from "../widget/widget-url.js";
import {
  updateProviderUi,
  updateAuthUi,
  showWarning,
  enhanceSelect,
  updateBgControlsVisibility,
  updateFontControlsVisibility
} from "./ui.js";

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
  controls.bgType = document.getElementById("bg-type");
  controls.bgColor2 = document.getElementById("bg-color-2");
  controls.bgGradientAngle = document.getElementById("bg-gradient-angle");
  controls.bgImageUrl = document.getElementById("bg-image-url");
  controls.bgImageBlur = document.getElementById("bg-image-blur");
  controls.bgImageOverlay = document.getElementById("bg-image-overlay");
  controls.bgArtBlur = document.getElementById("bg-art-blur");
  controls.bgArtOverlay = document.getElementById("bg-art-overlay");
  controls.bgGradientControls = document.getElementById("bg-gradient-controls");
  controls.bgImageControls = document.getElementById("bg-image-controls");
  controls.bgArtControls = document.getElementById("bg-art-controls");
  controls.googleFontUrl = document.getElementById("google-font-url");
  controls.fontCustomControls = document.getElementById("font-custom-controls");
  controls.textColor = document.getElementById("text-color");
  controls.mutedColor = document.getElementById("muted-color");
  controls.accentColor = document.getElementById("accent-color");
  controls.fontFamily = document.getElementById("font-family");
  controls.textAlign = document.getElementById("text-align");
  controls.widgetWidth = document.getElementById("widget-width");
  controls.widgetHeight = document.getElementById("widget-height");
  controls.widgetRadius = document.getElementById("widget-radius");
  controls.artSize = document.getElementById("art-size");
  controls.widgetPadding = document.getElementById("widget-padding");
  controls.widgetGap = document.getElementById("widget-gap");
  controls.fontScale = document.getElementById("font-scale");
  controls.titleSize = document.getElementById("title-size");
  controls.artistSize = document.getElementById("artist-size");
  controls.progressHeight = document.getElementById("progress-height");
  controls.progressBgAlpha = document.getElementById("progress-bg-alpha");
  controls.backdropBlur = document.getElementById("backdrop-blur");
  controls.shadowOpacity = document.getElementById("shadow-opacity");
  controls.shadowBlur = document.getElementById("shadow-blur");
  controls.borderWidth = document.getElementById("border-width");
  controls.borderColor = document.getElementById("border-color");
  controls.borderAlpha = document.getElementById("border-alpha");
  controls.visualizerHeight = document.getElementById("visualizer-height");
  controls.visualizerBarWidth = document.getElementById("visualizer-bar-width");
  controls.visualizerSpeed = document.getElementById("visualizer-speed");
  controls.marqueeSpeed = document.getElementById("marquee-speed");
  controls.hideOnPause = document.getElementById("hide-on-pause");
  controls.showArt = document.getElementById("show-art");
  controls.showVisualizer = document.getElementById("show-visualizer");
  controls.showProgress = document.getElementById("show-progress");
  controls.showTime = document.getElementById("show-time");
  controls.enableMarquee = document.getElementById("enable-marquee");
  controls.customCss = document.getElementById("custom-css");
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
    controls.bgType,
    controls.bgColor2,
    controls.bgGradientAngle,
    controls.bgImageUrl,
    controls.bgImageBlur,
    controls.bgImageOverlay,
    controls.bgArtBlur,
    controls.bgArtOverlay,
    controls.textColor,
    controls.mutedColor,
    controls.accentColor,
    controls.fontFamily,
    controls.googleFontUrl,
    controls.textAlign,
    controls.widgetWidth,
    controls.widgetHeight,
    controls.widgetRadius,
    controls.artSize,
    controls.widgetPadding,
    controls.widgetGap,
    controls.fontScale,
    controls.titleSize,
    controls.artistSize,
    controls.progressHeight,
    controls.progressBgAlpha,
    controls.backdropBlur,
    controls.shadowOpacity,
    controls.shadowBlur,
    controls.borderWidth,
    controls.borderColor,
    controls.borderAlpha,
    controls.visualizerHeight,
    controls.visualizerBarWidth,
    controls.visualizerSpeed,
    controls.marqueeSpeed,
    controls.hideOnPause,
    controls.showArt,
    controls.showVisualizer,
    controls.showProgress,
    controls.showTime,
    controls.enableMarquee,
    controls.customCss
  ]) {
    input.addEventListener("input", () => {
      syncWidgetSizeInputs(input);
      const settings = getSettings();
      applySettings(settings);
      updateWidgetUrl();
      if (preview.lastPayload) {
        renderWidget(preview, preview.lastPayload, settings, "previewTrackKey");
      }
    });
  }

  controls.bgType.addEventListener("change", updateBgControlsVisibility);
  updateBgControlsVisibility();

  controls.fontFamily.addEventListener("change", updateFontControlsVisibility);
  updateFontControlsVisibility();

  enhanceSelect(controls.bgType);
  enhanceSelect(controls.fontFamily);
  enhanceSelect(controls.textAlign);

  // Color swatches sit inside <label>, so clicking the label text would forward
  // to the input and open the OS color picker. Only let the swatch itself open it.
  for (const colorInput of document.querySelectorAll('input[type="color"]')) {
    const label = colorInput.closest("label");
    if (label) {
      label.addEventListener("click", (event) => {
        if (event.target !== colorInput) {
          event.preventDefault();
        }
      });
    }
  }
}

export async function initDashboard() {
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
