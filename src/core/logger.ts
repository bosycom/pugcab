export type Logger = {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
};

function nowIso() {
  return new Date().toISOString();
}

function log(level: string, message: string, meta?: unknown) {
  const base = `[${nowIso()}] ${level.toUpperCase()} ${message}`;
  if (meta === undefined) {
    console.log(base);
    return;
  }
  console.log(base, meta);
}

export const logger: Logger = {
  info(message: string, meta?: unknown) {
    log("info", message, meta);
  },
  warn(message: string, meta?: unknown) {
    log("warn", message, meta);
  },
  error(message: string, meta?: unknown) {
    log("error", message, meta);
  },
};
