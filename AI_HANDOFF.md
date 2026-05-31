# AI Handoff: OBS Spotify Widget

This document is for the next AI/chat session. It explains what this project is, what was already built, and what constraints matter.

## Current Product Goal

The project is now intended to be a **static GitHub Pages website** where an end user can:

1. Open the website.
2. Choose Spotify API or Last.fm as the source.
3. Fill the source settings.
4. Preview the OBS music widget.
5. Customize widget appearance.
6. Copy a generated OBS Browser Source URL.
7. Paste that URL into OBS.

The end user should **not** need to run Node.js locally.

## Important Architecture Decision

GitHub Pages is static hosting. There is no backend, no server-side session, and no safe place to store a Spotify client secret.

Because of that, the GitHub Pages app uses **Spotify Authorization Code with PKCE**:

- No `client_secret` in browser code.
- The site owner can leave `docs/site-config.js` as a placeholder.
- Each user can paste their own Spotify Client ID, which is stored in browser localStorage.
- The user authorizes through Spotify.
- The browser receives and stores the user's Spotify refresh token.
- The generated OBS URL contains the refresh token in the URL fragment after `#`.

The URL fragment is not sent to GitHub Pages, but it is still sensitive. The generated OBS URL must be treated as private.

## Main Static App

The GitHub Pages app lives in:

- `docs/index.html`
- `docs/style.css`
- `docs/app.js`
- `docs/site-config.js`

GitHub Pages should be configured to deploy from the `docs/` folder.

### `docs/site-config.js`

The file can provide a default Client ID, but for public use it is intentionally left as:

```js
window.OBS_SPOTIFY_WIDGET_CONFIG = {
  spotifyClientId: "PUT_YOUR_SPOTIFY_CLIENT_ID_HERE",
  appName: "OBS Spotify Widget"
};
```

Users paste their own Client ID into the UI. Each user's Spotify app dashboard must include the deployed GitHub Pages URL as an exact Redirect URI.

Example:

```text
https://yourname.github.io/obs-music-widget/
```

## Static App Modes

The same `docs/index.html` runs in two modes.

### Dashboard Mode

Default URL:

```text
https://yourname.github.io/obs-music-widget/
```

Responsibilities:

- Let the user switch between Spotify API and Last.fm.
- Store the user's Spotify Client ID in localStorage.
- Store Last.fm username/API key in localStorage when Last.fm mode is selected.
- Start Spotify OAuth PKCE login.
- Store auth data in browser localStorage.
- Show live/mock preview.
- Let the user customize:
  - background color
  - background opacity
  - main text color
  - muted text color
  - accent color
  - widget width
  - widget height
  - border radius
  - hide-on-pause behavior
- Generate OBS Browser Source URL.
- Copy URL to clipboard.

### Widget Mode

Generated URL shape:

```text
https://yourname.github.io/obs-music-widget/?widget=1#data=...
```

Responsibilities:

- Parse `#data`.
- Apply saved theme/customization.
- Refresh Spotify access tokens directly in the OBS browser source.
- Poll Spotify currently-playing API.
- Render only the transparent widget UI.

## Spotify API Flow

Dashboard login:

1. Generate PKCE verifier and challenge.
2. Redirect to `https://accounts.spotify.com/authorize`.
3. Use scope:

   ```text
   user-read-currently-playing
   ```

4. On callback, exchange `code` for tokens at:

   ```text
   https://accounts.spotify.com/api/token
   ```

5. Store `refresh_token` in localStorage.

Widget polling:

1. Use `refresh_token` and Client ID to get an access token.
2. Poll:

   ```text
   https://api.spotify.com/v1/me/player/currently-playing?additional_types=track
   ```

3. Render:
   - `playing`: show widget, animate visualizer.
   - `paused`: either hide widget or show frozen visualizer depending on setting.
   - `stopped` / `204`: hide widget.
   - `429` or transient errors: keep prior UI state.

## Legacy Local Node Backend

There is still a local Node/TypeScript backend in:

- `src/server.ts`
- `src/spotify.ts`
- `src/types.ts`
- `src/logger.ts`

It was built during an earlier local-server version of the project. The current user-facing direction is GitHub Pages/static-first, but the backend still compiles and tests pass.

Do not assume the Node backend is the main product unless the user explicitly asks for local/server deployment.

## Tests And Checks

Run from:

```text
C:\project\obs-wig-spot\obs-music-widget
```

Commands:

```bash
npm test
npm run lint
npm run build
```

Current state when this handoff was written:

- `npm test`: passes.
- `npm run lint`: passes.
- `npm run build`: passes.
- Static `docs/` HTTP smoke test passed with `Invoke-WebRequest`.

`npm test` includes:

- `node --check docs/app.js`
- TypeScript Spotify tests in `tests/spotify.test.ts`

## Browser Verification Note

An attempt was made to use `browser-act` for real browser smoke testing. The CLI installed, but then blocked execution because its local skill metadata was stale/incompatible and requested a global skill update.

Do not treat that as an app failure. The fallback static HTTP smoke test passed.

If a future session wants full browser verification, either:

- fix/update the global `browser-act` skill metadata intentionally, or
- use another browser automation route approved by the user.

## UI/Frontend Constraints

Keep the GitHub Pages UI practical and tool-like:

- First screen should be the actual setup/customization app, not a marketing landing page.
- Keep OBS widget background transparent in widget mode.
- Do not use heavy frameworks.
- Do not require a backend for the user.
- Do not introduce a Spotify client secret into static frontend code.
- Generated OBS URLs are sensitive because they include refresh token data in the URL fragment.

## Key Files

- `README.md`: user/developer setup for GitHub Pages.
- `AI_HANDOFF.md`: this file.
- `docs/site-config.js`: deployment-time Spotify Client ID.
- `docs/app.js`: PKCE, token refresh, preview, widget link generation, OBS widget polling.
- `docs/style.css`: dashboard and widget styling.
- `docs/index.html`: dashboard and widget DOM.
- `tests/spotify.test.ts`: Node backend Spotify logic tests.
- `package.json`: scripts, including `site:check`.

## Likely Next Tasks

Useful next improvements:

- Add automated browser tests for `docs/` with Playwright or a fixed browser-act setup.
- Add import/export of customization presets.
- Add optional token revocation/help instructions for users who leak an OBS URL.
- Consider a backend deployment option if the user later wants better token security than a static GitHub Pages app can provide.
