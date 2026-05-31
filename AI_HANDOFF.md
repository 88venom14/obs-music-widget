# AI Handoff: OBS Music Widget

This document is a project map for future AI sessions. It describes what the project is, where the main pieces are, and how they fit together.

## Product

This repository contains an OBS browser-source music widget and a static setup/customization page.

The primary user flow is:

1. Open the static setup page.
2. Choose Spotify API or Last.fm as the track source.
3. Configure the source.
4. Preview the widget.
5. Customize the widget appearance.
6. Copy the generated OBS Browser Source URL.
7. Paste that URL into OBS.

The static app is designed to work on GitHub Pages without a backend.

## Directory Map

- `docs/`: GitHub Pages app. This is the main user-facing app.
- `public/`: local-server OBS widget files used by the Node backend.
- `src/`: local Node/TypeScript backend and Spotify helpers.
- `tests/`: Node test suite.
- `dist/`: TypeScript build output.
- `AI_HANDOFF.md`: project map for AI agents.
- `README.md`: user/developer documentation.
- `package.json`: npm scripts and dependencies.
- `config.json`: local backend configuration.

## GitHub Pages App

Main files:

- `docs/index.html`: dashboard markup and hidden widget-mode markup.
- `docs/style.css`: dashboard CSS and GitHub Pages widget CSS.
- `docs/app.js`: app runtime, source integrations, preview, customization, OBS URL generation, widget-mode polling.
- `docs/site-config.js`: optional deployment config for a default Spotify Client ID.
- `docs/adoforsite.webp`: dashboard background image.
- `docs/favicon.png`: favicon used by the static page.

GitHub Pages should deploy from the `docs/` directory.

## App Modes

`docs/index.html` runs in two modes.

Dashboard mode:

- Normal URL without `?widget=1`.
- Shows setup, source selector, preview, customization controls, and OBS URL output.
- Stores settings/source credentials in browser storage where needed.
- Generates the final OBS URL.

Widget mode:

- URL contains `?widget=1#data=...`.
- Hides the dashboard and renders only the widget.
- Reads config from the `#data` fragment.
- Polls Spotify or Last.fm directly from the OBS browser source.

Generated URL shape:

```text
https://example.github.io/obs-music-widget/?widget=1#data=...
```

The fragment data can contain tokens or API keys. Treat generated OBS URLs as private.

## Sources

Spotify:

- Uses Authorization Code with PKCE in the static frontend.
- Does not use or store a Spotify client secret.
- User provides Spotify Client ID.
- Scope: `user-read-currently-playing`.
- Token and source data are stored client-side.
- Current playback endpoint:

```text
https://api.spotify.com/v1/me/player/currently-playing?additional_types=track
```

Last.fm:

- Uses Last.fm username and API key.
- Polls recent tracks.
- Fetches track duration through `track.getInfo`.
- Falls back to 3 minutes when duration is missing.

## Dashboard UI

The dashboard is a practical setup/customization tool, not a landing page.

Visual structure:

- Left column: source setup and preview.
- Middle column: customization controls.
- Right/output column: custom CSS and OBS URL.

Background:

- The page background image is `docs/adoforsite.webp`.
- It is applied in `docs/style.css` on `body`.
- It should stay on the setup page background only.
- The image should not be added to the widget itself.

Transparency:

- Dashboard panels and form controls are semi-transparent so the background image remains visible.
- Main CSS variables:

```css
--panel-bg: rgba(16, 17, 34, 0.38);
--field-bg: rgba(9, 11, 24, 0.44);
--field-bg-muted: rgba(14, 17, 34, 0.4);
```

## Widget UI

The widget should remain user-customizable.

Important rules:

- Do not put the dashboard background image inside the widget.
- Do not add glow effects to widget elements unless explicitly requested.
- Do not force the widget palette to match the page background.

The GitHub Pages widget style in `docs/style.css` is controlled by CSS variables, including:

- `--bg-color`
- `--text-main-color`
- `--text-muted-color`
- `--accent-color`
- `--font-family-widget`
- `--text-align-widget`
- `--widget-width`
- `--widget-height`
- `--art-size`
- `--widget-padding-y`
- `--widget-padding-x`
- `--widget-gap`
- `--title-size`
- `--artist-size`
- `--progress-height`
- `--progress-bg-color`
- `--backdrop-blur`
- `--shadow-opacity`
- `--shadow-blur`
- `--border-width`
- `--border-color`
- `--visualizer-height`
- `--visualizer-bar-width`
- `--visualizer-speed`
- `--marquee-speed`

These are applied by `applySettings()` in `docs/app.js`.

Widget sizing:

- Width and height controls exist in the dashboard.
- Internal controls such as art size, padding, gap, font sizes, progress, visualizer size, and border can increase the required widget size.
- `getRecommendedWidgetSize(settings)` calculates the minimum recommended dimensions.
- `syncWidgetSizeInputs(sourceInput)` increases width/height inputs when internal content would otherwise overflow.
- The input handler in `bindDashboard()` calls `syncWidgetSizeInputs(input)` before applying settings.

## Customization State

Default dashboard/widget settings are in `DEFAULT_SETTINGS` in `docs/app.js`.

The dashboard controls are wired in `bindDashboard()`:

- Color and opacity controls.
- Font family and text alignment.
- Width, height, radius.
- Art size, padding, gap.
- Font scale, title size, artist size.
- Progress height/background opacity.
- Blur, shadow, border.
- Visualizer height/bar width/speed.
- Marquee speed and toggle.
- Show/hide toggles for art, visualizer, progress, and time.
- Custom CSS textarea.

Custom CSS is stored in generated URL data and injected through `applyCustomCss()`.

## Local Node Backend

The local backend is separate from the static GitHub Pages flow.

Files:

- `src/server.ts`: HTTP server, local static serving, WebSocket server, local Spotify auth callback.
- `src/spotify.ts`: Spotify API helpers and payload conversion.
- `src/types.ts`: shared TypeScript types.
- `src/logger.ts`: logging.
- `public/index.html`: local widget HTML.
- `public/style.css`: local widget CSS.
- `public/app.js`: local widget browser script.

`src/server.ts` serves files from `public/` and supports `.webp` MIME type.

Use the backend only when the user wants local/server mode.

## Local Widget Defaults

`public/style.css` is the local backend widget style. It has simple defaults:

- Transparent page.
- Translucent dark widget background.
- White main text.
- Muted gray secondary text.
- Orange accent.
- No dashboard background image.
- No extra glow effects.

## Assets

- `adoforsite.webp`: root copy of the dashboard background image.
- `docs/adoforsite.webp`: active GitHub Pages dashboard background.
- `public/adoforsite.webp`: available in public assets, not currently referenced by `public/style.css`.
- `favicon.png`: root favicon candidate.
- `docs/favicon.png`: favicon linked by `docs/index.html`.

Do not delete or overwrite assets unless the user asks.

## Commands

Run from repository root:

```bash
npm run site:check
npm test
npm run lint
npm run build
npm run dev
npm run start
```

Script meanings:

- `npm run site:check`: syntax-checks `docs/app.js`.
- `npm test`: runs `site:check` and Node tests in `tests/**/*.test.ts`.
- `npm run lint`: TypeScript `--noEmit` check.
- `npm run build`: cleans and compiles TypeScript into `dist/`.
- `npm run dev`: runs local backend with `ts-node`.
- `npm run start`: runs compiled backend from `dist/server.js`.

## Working Rules

- Keep the static GitHub Pages app backend-free.
- Do not put Spotify client secrets in frontend code.
- Do not revert dirty work unless explicitly requested.
- Use `apply_patch` for manual file edits.
- Prefer `rg` for code search.
- Keep UI changes consistent with the existing dashboard and widget separation.
- Treat generated OBS URLs as sensitive because they may include tokens or API keys in the URL fragment.
