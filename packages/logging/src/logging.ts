import { createDefaultLoggingConfig } from "./config.js";
import { createLogger } from "./logger.js";
import type { Logger, LoggerConfig, LoggingConfig } from "./types.js";

export class Logging {
  private readonly defaultLogger: string;
  private readonly defaultConfig: LoggerConfig;
  private readonly loggerConfigs: Readonly<Record<string, LoggerConfig>>;
  private readonly loggers = new Map<string, Logger>();

  constructor(config: LoggingConfig = createDefaultLoggingConfig()) {
    const {
      default: defaultLogger = "system",
      loggers = {},
      ...defaultConfig
    } = config;
    this.defaultLogger = defaultLogger;
    this.defaultConfig = defaultConfig;
    this.loggerConfigs = loggers;
  }

  getLogger(name: string = this.defaultLogger): Logger {
    const existing = this.loggers.get(name);
    if (existing) {
      return existing;
    }

    const config = resolveLoggerConfig(
      this.defaultConfig,
      this.loggerConfigs[name],
      name,
    );
    const logger = createLogger(config).child({ logger: name });
    this.loggers.set(name, logger);
    return logger;
  }

  async flush(): Promise<void> {
    await Promise.all(
      [...this.loggers.values()].map((logger) => this.flushLogger(logger)),
    );
  }

  private flushLogger(logger: Logger): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.flush((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

export function createLogging(
  config: LoggingConfig = createDefaultLoggingConfig(),
): Logging {
  return new Logging(config);
}

function resolveLoggerConfig(
  defaultConfig: LoggerConfig,
  override: LoggerConfig | undefined,
  loggerName: string,
): LoggerConfig {
  const config = mergeLoggerConfig(defaultConfig, override);
  return {
    ...config,
    transport: resolveTransportTemplate(config.transport, loggerName),
  };
}

function mergeLoggerConfig(
  defaultConfig: LoggerConfig,
  override: LoggerConfig | undefined,
): LoggerConfig {
  if (!override) {
    return { ...defaultConfig };
  }

  return {
    ...defaultConfig,
    ...override,
    base: mergeObjectConfig(defaultConfig.base, override.base),
    transport: mergeTransportConfig(
      defaultConfig.transport,
      override.transport,
    ),
  };
}

function mergeObjectConfig<T>(
  base: T | undefined,
  override: T | undefined,
): T | undefined {
  if (override === undefined) {
    return base;
  }
  if (!isRecord(base) || !isRecord(override)) {
    return override;
  }
  return {
    ...base,
    ...override,
  };
}

function mergeTransportConfig(
  base: LoggerConfig["transport"],
  override: LoggerConfig["transport"],
): LoggerConfig["transport"] {
  if (override === undefined) {
    return base;
  }
  if (!isRecord(base) || !isRecord(override)) {
    return override;
  }

  return {
    ...base,
    ...override,
    options: mergeObjectConfig(base.options, override.options),
  } as LoggerConfig["transport"];
}

function resolveTransportTemplate(
  transport: LoggerConfig["transport"],
  loggerName: string,
): LoggerConfig["transport"] {
  if (!isRecord(transport) || !isRecord(transport.options)) {
    return transport;
  }

  const destination = transport.options.destination;
  if (typeof destination !== "string" || !destination.includes("{logger}")) {
    return transport;
  }

  return {
    ...transport,
    options: {
      ...transport.options,
      destination: destination.replaceAll("{logger}", loggerName),
    },
  } as LoggerConfig["transport"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
