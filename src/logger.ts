type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  if (level === "error") {
    console.error(line);
    if (error !== undefined) {
      console.error(error);
    }
    return;
  }

  if (level === "warn") {
    console.warn(line);
    if (error !== undefined) {
      console.warn(error);
    }
    return;
  }

  console.log(line);
}

export const logger = {
  info: (message: string): void => write("info", message),
  warn: (message: string, error?: unknown): void => write("warn", message, error),
  error: (message: string, error?: unknown): void => write("error", message, error)
};
