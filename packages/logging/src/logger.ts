import pino, { stdTimeFunctions, type DestinationStream } from "pino";

import type { Logger, LoggerConfig } from "./types.js";

export const defaultRedactPaths: readonly string[] = [
  "password",
  "*.password",
  "password_confirmation",
  "*.password_confirmation",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "apiKey",
  "*.apiKey",
  "secret",
  "*.secret",
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "headers.authorization",
  "headers.Authorization",
  "headers.cookie",
  "headers.Cookie",
  "req.headers.authorization",
  "req.headers.Authorization",
  "req.headers.cookie",
  "req.headers.Cookie",
];

function resolveRedact(
  redact: LoggerConfig["redact"],
): Exclude<LoggerConfig["redact"], false | undefined> | undefined {
  if (redact === false) {
    return undefined;
  }
  if (!redact) {
    return { paths: [...defaultRedactPaths], censor: "[REDACTED]" };
  }
  if (Array.isArray(redact)) {
    return {
      paths: [...new Set([...defaultRedactPaths, ...redact])],
      censor: "[REDACTED]",
    };
  }
  return {
    ...redact,
    paths: [...new Set([...defaultRedactPaths, ...redact.paths])],
    censor: redact.censor ?? "[REDACTED]",
  };
}

export function createLogger(
  config: LoggerConfig = {},
  destination?: DestinationStream,
): Logger {
  if (config.transport && destination) {
    throw new Error("A logger cannot use both transport and destination.");
  }

  const { redact: configuredRedact, ...options } = config;
  const redact = resolveRedact(configuredRedact);
  const loggerOptions: pino.LoggerOptions = {
    ...options,
    timestamp: options.timestamp ?? stdTimeFunctions.isoTime,
    ...(redact ? { redact } : {}),
  };

  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}
