import dotenv from "dotenv";
import { randomBytes } from "crypto";
import { createReadStream, existsSync, promises as fs } from "fs";
import http, { IncomingMessage, ServerResponse } from "http";
import path from "path";
import { WebSocket, WebSocketServer } from "ws";
import { logger } from "./logger";
import { buildSpotifyAuthUrl, exchangeCodeForTokens, pollSpotify, STOPPED_PAYLOAD } from "./spotify";
import type { AppConfig, PublicConfig, TrackPayload } from "./types";

dotenv.config();

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");
const MIN_POLLING_INTERVAL_MS = 1500;

const DEFAULT_CONFIG: AppConfig = {
  spotify: {
    client_id: "YOUR_SPOTIFY_CLIENT_ID",
    client_secret: "YOUR_SPOTIFY_CLIENT_SECRET",
    redirect_uri: "http://localhost:3000/auth/callback",
    refresh_token: ""
  },
  server: {
    port: 3000,
    polling_interval_ms: 3000,
    hide_on_pause: true
  },
  theme: {
    "--bg-color": "rgba(10, 10, 10, 0.75)",
    "--text-main-color": "#FFFFFF",
    "--text-muted-color": "#8E8E93",
    "--accent-color": "#FF4500",
    "--font-family": "'SF Pro Display', 'Inter', system-ui, sans-serif",
    "--border-radius-art": "10px",
    "--border-radius-widget": "14px",
    "--widget-width": "420px",
    "--widget-height": "90px"
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeConfig(base: AppConfig, overrides: unknown): AppConfig {
  if (!isRecord(overrides)) {
    logger.warn("config.json is not an object. Using defaults.");
    return base;
  }

  const config = structuredClone(base);

  if (isRecord(overrides.spotify)) {
    if (typeof overrides.spotify.client_id === "string") {
      config.spotify.client_id = overrides.spotify.client_id;
    } else {
      logger.warn("Missing spotify.client_id in config.json. Using default or .env override.");
    }

    if (typeof overrides.spotify.client_secret === "string") {
      config.spotify.client_secret = overrides.spotify.client_secret;
    } else {
      logger.warn("Missing spotify.client_secret in config.json. Using default or .env override.");
    }

    if (typeof overrides.spotify.redirect_uri === "string") {
      config.spotify.redirect_uri = overrides.spotify.redirect_uri;
    }

    if (typeof overrides.spotify.refresh_token === "string") {
      config.spotify.refresh_token = overrides.spotify.refresh_token;
    }
  } else {
    logger.warn("Missing spotify block in config.json. Using defaults.");
  }

  if (isRecord(overrides.server)) {
    if (typeof overrides.server.port === "number") {
      config.server.port = overrides.server.port;
    }
    if (typeof overrides.server.polling_interval_ms === "number") {
      config.server.polling_interval_ms = Math.max(overrides.server.polling_interval_ms, MIN_POLLING_INTERVAL_MS);
    }
    if (typeof overrides.server.hide_on_pause === "boolean") {
      config.server.hide_on_pause = overrides.server.hide_on_pause;
    }
  } else {
    logger.warn("Missing server block in config.json. Using defaults.");
  }

  if (isRecord(overrides.theme)) {
    for (const [key, value] of Object.entries(overrides.theme)) {
      if (key.startsWith("--") && typeof value === "string") {
        config.theme[key] = value;
      }
    }
  } else {
    logger.warn("Missing theme block in config.json. Using defaults.");
  }

  config.spotify.client_id = process.env.SPOTIFY_CLIENT_ID || config.spotify.client_id;
  config.spotify.client_secret = process.env.SPOTIFY_CLIENT_SECRET || config.spotify.client_secret;
  config.spotify.redirect_uri = process.env.SPOTIFY_REDIRECT_URI || config.spotify.redirect_uri;
  config.spotify.refresh_token = process.env.SPOTIFY_REFRESH_TOKEN || config.spotify.refresh_token;

  return config;
}

export async function loadConfig(): Promise<AppConfig> {
  if (!existsSync(CONFIG_PATH)) {
    logger.warn("config.json was not found. Using defaults.");
    return mergeConfig(DEFAULT_CONFIG, {});
  }

  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw));
  } catch (error) {
    logger.error("Failed to read config.json. Using defaults.", error);
    return mergeConfig(DEFAULT_CONFIG, {});
  }
}

function getPublicConfig(config: AppConfig): PublicConfig {
  return {
    server: {
      hide_on_pause: config.server.hide_on_pause
    },
    theme: config.theme
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(body);
}

async function saveEnvValue(key: string, value: string): Promise<void> {
  const nextLine = `${key}=${value}`;
  const raw = existsSync(ENV_PATH) ? await fs.readFile(ENV_PATH, "utf8") : "";
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));

  if (index >= 0) {
    lines[index] = nextLine;
  } else {
    lines.push(nextLine);
  }

  await fs.writeFile(ENV_PATH, `${lines.join("\n")}\n`, "utf8");
}

function getContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function resolvePublicFile(requestUrl: string): string | null {
  const parsed = new URL(requestUrl, "http://localhost");
  const pathname = decodeURIComponent(parsed.pathname === "/" ? "/index.html" : parsed.pathname);
  const resolved = path.resolve(PUBLIC_DIR, `.${pathname}`);

  if (!resolved.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return resolved;
}

function serveStatic(request: IncomingMessage, response: ServerResponse): void {
  const filePath = resolvePublicFile(request.url || "/");

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": getContentType(filePath),
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}

function payloadEquals(left: TrackPayload, right: TrackPayload): boolean {
  return JSON.stringify({ ...left, timestamp: 0 }) === JSON.stringify({ ...right, timestamp: 0 });
}

function broadcast(wss: WebSocketServer, payload: TrackPayload): void {
  const serialized = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

async function main(): Promise<void> {
  const config = await loadConfig();
  let lastPayload: TrackPayload = { ...STOPPED_PAYLOAD, timestamp: Date.now() };
  let authState: string | null = null;

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", `http://localhost:${config.server.port}`);

    if (requestUrl.pathname === "/config") {
      sendJson(response, 200, getPublicConfig(config));
      return;
    }

    if (requestUrl.pathname === "/auth/login") {
      authState = randomBytes(16).toString("hex");
      response.writeHead(302, {
        Location: buildSpotifyAuthUrl(
          {
            clientId: config.spotify.client_id,
            clientSecret: config.spotify.client_secret,
            redirectUri: config.spotify.redirect_uri,
            refreshToken: config.spotify.refresh_token
          },
          authState
        )
      });
      response.end();
      return;
    }

    if (requestUrl.pathname === "/auth/callback") {
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");

      if (error) {
        sendHtml(response, 400, `<h1>Spotify authorization failed</h1><p>${error}</p>`);
        return;
      }

      if (!code || !authState || state !== authState) {
        sendHtml(response, 400, "<h1>Invalid Spotify authorization callback</h1><p>Start again at /auth/login.</p>");
        return;
      }

      void exchangeCodeForTokens(
        {
          clientId: config.spotify.client_id,
          clientSecret: config.spotify.client_secret,
          redirectUri: config.spotify.redirect_uri,
          refreshToken: config.spotify.refresh_token
        },
        code
      )
        .then(async (token) => {
          if (!token?.refresh_token) {
            sendHtml(response, 500, "<h1>Spotify did not return a refresh token</h1><p>Remove the app access in Spotify and try /auth/login again.</p>");
            return;
          }

          config.spotify.refresh_token = token.refresh_token;
          await saveEnvValue("SPOTIFY_REFRESH_TOKEN", token.refresh_token);
          authState = null;
          sendHtml(response, 200, "<h1>Spotify connected</h1><p>You can close this tab and use the OBS widget.</p>");
        })
        .catch((callbackError: unknown) => {
          logger.error("Spotify authorization callback failed.", callbackError);
          sendHtml(response, 500, "<h1>Spotify authorization failed</h1><p>Check the server logs and try again.</p>");
        });
      return;
    }

    serveStatic(request, response);
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify(lastPayload));
  });

  const poll = async (): Promise<void> => {
    const nextPayload = await pollSpotify({
      credentials: {
        clientId: config.spotify.client_id,
        clientSecret: config.spotify.client_secret,
        redirectUri: config.spotify.redirect_uri,
        refreshToken: config.spotify.refresh_token
      },
      previousPayload: lastPayload
    });

    if (!payloadEquals(lastPayload, nextPayload)) {
      lastPayload = nextPayload;
      broadcast(wss, lastPayload);
    }
  };

  const intervalMs = Math.max(config.server.polling_interval_ms, MIN_POLLING_INTERVAL_MS);
  const pollTimer = setInterval(() => {
    void poll();
  }, intervalMs);

  await poll();

  server.listen(config.server.port, () => {
    logger.info(`OBS Music Widget running at http://localhost:${config.server.port}`);
    logger.info(`Polling Spotify every ${intervalMs}ms`);
    if (!config.spotify.refresh_token) {
      logger.info(`Connect Spotify at http://localhost:${config.server.port}/auth/login`);
    }
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info(`Received ${signal}. Shutting down.`);
    clearInterval(pollTimer);

    wss.close(() => {
      server.close((error) => {
        if (error) {
          logger.error("HTTP server closed with an error.", error);
          process.exit(1);
        }

        process.exit(0);
      });
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  void main().catch((error) => {
    logger.error("Server startup failed.", error);
    process.exit(1);
  });
}
