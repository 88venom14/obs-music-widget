import { state, controls } from "../core/state.js";
import { customCssStyleId } from "../core/config.js";
import {
  normalizeSettings,
  hexToRgba,
  safeCssUrl,
  getRecommendedWidgetSize,
  FONT_FAMILIES,
  DEFAULT_SETTINGS
} from "../core/core.js";

function applyCustomCss(css) {
  let style = document.getElementById(customCssStyleId);
  if (!css) {
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement("style");
    style.id = customCssStyleId;
    document.head.append(style);
  }

  style.textContent = css;
}

export function getSettings() {
  return {
    bgColor: controls.bgColor.value,
    bgAlpha: Number(controls.bgAlpha.value),
    bgType: controls.bgType.value,
    bgColor2: controls.bgColor2.value,
    bgGradientAngle: Number(controls.bgGradientAngle.value),
    bgImageUrl: controls.bgImageUrl.value.trim(),
    bgImageBlur: Number(controls.bgImageBlur.value),
    bgImageOverlay: Number(controls.bgImageOverlay.value),
    bgArtBlur: Number(controls.bgArtBlur.value),
    bgArtOverlay: Number(controls.bgArtOverlay.value),
    textColor: controls.textColor.value,
    mutedColor: controls.mutedColor.value,
    accentColor: controls.accentColor.value,
    fontFamily: controls.fontFamily.value,
    googleFontUrl: controls.googleFontUrl.value.trim(),
    textAlign: controls.textAlign.value,
    widgetWidth: Number(controls.widgetWidth.value),
    widgetHeight: Number(controls.widgetHeight.value),
    widgetRadius: Number(controls.widgetRadius.value),
    artSize: Number(controls.artSize.value),
    widgetPadding: Number(controls.widgetPadding.value),
    widgetGap: Number(controls.widgetGap.value),
    fontScale: Number(controls.fontScale.value),
    titleSize: Number(controls.titleSize.value),
    artistSize: Number(controls.artistSize.value),
    progressHeight: Number(controls.progressHeight.value),
    progressBgAlpha: Number(controls.progressBgAlpha.value),
    backdropBlur: Number(controls.backdropBlur.value),
    shadowOpacity: Number(controls.shadowOpacity.value),
    shadowBlur: Number(controls.shadowBlur.value),
    borderWidth: Number(controls.borderWidth.value),
    borderColor: controls.borderColor.value,
    borderAlpha: Number(controls.borderAlpha.value),
    visualizerHeight: Number(controls.visualizerHeight.value),
    visualizerBarWidth: Number(controls.visualizerBarWidth.value),
    visualizerSpeed: Number(controls.visualizerSpeed.value),
    marqueeSpeed: Number(controls.marqueeSpeed.value),
    hideOnPause: controls.hideOnPause.checked,
    showArt: controls.showArt.checked,
    showVisualizer: controls.showVisualizer.checked,
    showProgress: controls.showProgress.checked,
    showTime: controls.showTime.checked,
    enableMarquee: controls.enableMarquee.checked,
    customCss: controls.customCss.value
  };
}

function clampToInputRange(input, value) {
  const min = Number(input.min || 0);
  const max = Number(input.max || value);
  return Math.min(Math.max(Math.ceil(value), min), max);
}

export function syncWidgetSizeInputs(sourceInput) {
  if (sourceInput === controls.widgetWidth || sourceInput === controls.widgetHeight) {
    return;
  }

  const settings = getSettings();
  const recommended = getRecommendedWidgetSize(settings);
  const nextWidth = clampToInputRange(controls.widgetWidth, recommended.width);
  const nextHeight = clampToInputRange(controls.widgetHeight, recommended.height);

  if (Number(controls.widgetWidth.value) < nextWidth) {
    controls.widgetWidth.value = String(nextWidth);
  }

  if (Number(controls.widgetHeight.value) < nextHeight) {
    controls.widgetHeight.value = String(nextHeight);
  }
}

function loadGoogleFont(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_error) {
    return "";
  }

  if (parsed.hostname !== "fonts.googleapis.com") {
    return "";
  }

  const firstFamily = parsed.searchParams.getAll("family")[0] || "";
  const familyName = firstFamily.split(":")[0].replace(/\+/g, " ").trim();
  if (!familyName) {
    return "";
  }

  let link = document.getElementById("google-font-link");
  if (!link) {
    link = document.createElement("link");
    link.id = "google-font-link";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== url) {
    link.setAttribute("href", url);
  }

  return familyName;
}

function applyWidgetFont(settings) {
  if (settings.fontFamily === "custom" && settings.googleFontUrl) {
    const family = loadGoogleFont(settings.googleFontUrl);
    if (family) {
      document.documentElement.style.setProperty("--font-family-widget", `"${family}", system-ui, sans-serif`);
      return;
    }
  }

  document.documentElement.style.setProperty("--font-family-widget", FONT_FAMILIES[settings.fontFamily] || FONT_FAMILIES.system);
}

export function applySettings(settings) {
  const nextSettings = normalizeSettings(settings);
  const borderColor = typeof nextSettings.borderColor === "string" ? nextSettings.borderColor : DEFAULT_SETTINGS.borderColor;
  const bgColor = typeof nextSettings.bgColor === "string" ? nextSettings.bgColor : DEFAULT_SETTINGS.bgColor;

  document.documentElement.style.setProperty("--bg-color", hexToRgba(bgColor, nextSettings.bgAlpha));
  const bgColor2 = typeof nextSettings.bgColor2 === "string" ? nextSettings.bgColor2 : DEFAULT_SETTINGS.bgColor2;
  document.documentElement.style.setProperty(
    "--bg-gradient",
    `linear-gradient(${nextSettings.bgGradientAngle}deg, ${hexToRgba(bgColor, nextSettings.bgAlpha)}, ${hexToRgba(bgColor2, nextSettings.bgAlpha)})`
  );
  document.documentElement.style.setProperty("--bg-image-url", safeCssUrl(nextSettings.bgImageUrl));
  document.documentElement.style.setProperty("--bg-image-blur", `${nextSettings.bgImageBlur}px`);
  document.documentElement.style.setProperty("--bg-image-overlay", String(nextSettings.bgImageOverlay));
  document.documentElement.style.setProperty("--bg-art-blur", `${nextSettings.bgArtBlur}px`);
  document.documentElement.style.setProperty("--bg-art-overlay", String(nextSettings.bgArtOverlay));
  document.documentElement.style.setProperty("--text-main-color", nextSettings.textColor);
  document.documentElement.style.setProperty("--text-muted-color", nextSettings.mutedColor);
  document.documentElement.style.setProperty("--accent-color", nextSettings.accentColor);
  applyWidgetFont(nextSettings);
  document.documentElement.style.setProperty("--text-align-widget", nextSettings.textAlign);
  document.documentElement.style.setProperty("--widget-width", `${nextSettings.widgetWidth}px`);
  document.documentElement.style.setProperty("--widget-height", `${nextSettings.widgetHeight}px`);
  document.documentElement.style.setProperty("--border-radius-widget", `${nextSettings.widgetRadius}px`);
  document.documentElement.style.setProperty("--border-radius-art", `${Math.max(nextSettings.widgetRadius - 4, 0)}px`);
  document.documentElement.style.setProperty("--art-size", `${nextSettings.artSize}px`);
  document.documentElement.style.setProperty("--widget-padding-y", `${nextSettings.widgetPadding}px`);
  document.documentElement.style.setProperty("--widget-padding-x", `${Math.round(nextSettings.widgetPadding * 1.15)}px`);
  document.documentElement.style.setProperty("--widget-gap", `${nextSettings.widgetGap}px`);
  document.documentElement.style.setProperty("--font-scale", String(nextSettings.fontScale));
  document.documentElement.style.setProperty("--title-size", `${nextSettings.titleSize}px`);
  document.documentElement.style.setProperty("--artist-size", `${nextSettings.artistSize}px`);
  document.documentElement.style.setProperty("--progress-height", `${nextSettings.progressHeight}px`);
  document.documentElement.style.setProperty("--progress-bg-color", hexToRgba("#ffffff", nextSettings.progressBgAlpha));
  document.documentElement.style.setProperty("--backdrop-blur", `${nextSettings.backdropBlur}px`);
  document.documentElement.style.setProperty("--shadow-opacity", String(nextSettings.shadowOpacity));
  document.documentElement.style.setProperty("--shadow-blur", `${nextSettings.shadowBlur}px`);
  document.documentElement.style.setProperty("--border-width", `${nextSettings.borderWidth}px`);
  document.documentElement.style.setProperty("--border-color", hexToRgba(borderColor, nextSettings.borderAlpha));
  document.documentElement.style.setProperty("--visualizer-height", `${nextSettings.visualizerHeight}px`);
  document.documentElement.style.setProperty("--visualizer-bar-width", `${nextSettings.visualizerBarWidth}px`);
  document.documentElement.style.setProperty("--visualizer-speed", `${nextSettings.visualizerSpeed}s`);
  document.documentElement.style.setProperty("--marquee-speed", `${nextSettings.marqueeSpeed}s`);
  state.marqueeEnabled = nextSettings.enableMarquee;
  applyCustomCss(nextSettings.customCss);
}
