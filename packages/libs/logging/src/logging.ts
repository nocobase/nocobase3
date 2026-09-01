import { symbols, type DestinationStream } from 'pino';

import { createDefaultLoggingConfig } from './config.js';
import { createLogger } from './logger.js';
import type { Logger, LoggerConfig, LoggingConfig } from './types.js';

interface ClosableDestinationStream extends DestinationStream {
  readonly closed?: boolean;
  readonly destroyed?: boolean;
  end(): void;
  off(event: 'close', listener: () => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
  once(event: 'close', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
}

export class Logging {
  private readonly defaultLogger: string;
  private readonly defaultConfig: LoggerConfig;
  private readonly loggerConfigs: Readonly<Record<string, LoggerConfig>>;
  private readonly loggers = new Map<string, Logger>();
  private readonly transportLoggers = new Set<Logger>();
  private readonly transportStreams = new Set<ClosableDestinationStream>();
  private closePromise: Promise<void> | undefined;

  constructor(config: LoggingConfig = createDefaultLoggingConfig()) {
    const {
      default: defaultLogger = 'system',
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
    if (config.transport) {
      this.transportLoggers.add(logger);
      this.transportStreams.add(resolveClosableStream(logger));
    }
    this.loggers.set(name, logger);
    return logger;
  }

  async flush(): Promise<void> {
    await Promise.all(
      [...this.loggers.values()].map((logger) => this.flushLogger(logger)),
    );
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeLoggers();
    return this.closePromise;
  }

  private async closeLoggers(): Promise<void> {
    await Promise.all([
      ...[...this.loggers.values()]
        .filter((logger) => !this.transportLoggers.has(logger))
        .map((logger) => this.flushLogger(logger)),
      ...[...this.transportStreams].map(closeTransportStream),
    ]);
    this.transportLoggers.clear();
    this.transportStreams.clear();
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

function resolveClosableStream(logger: Logger): ClosableDestinationStream {
  const stream = (
    logger as unknown as {
      readonly [symbols.streamSym]: DestinationStream;
    }
  )[symbols.streamSym];
  if (
    typeof (stream as Partial<ClosableDestinationStream>).end !== 'function' ||
    typeof (stream as Partial<ClosableDestinationStream>).once !== 'function'
  ) {
    throw new Error('Configured logging transport is not closable.');
  }
  return stream as ClosableDestinationStream;
}

function closeTransportStream(
  stream: ClosableDestinationStream,
): Promise<void> {
  if (stream.closed || stream.destroyed) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      stream.off('close', handleClose);
      stream.off('error', handleError);
    };
    const handleClose = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    stream.once('close', handleClose);
    stream.once('error', handleError);
    try {
      stream.end();
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
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
  base: LoggerConfig['transport'],
  override: LoggerConfig['transport'],
): LoggerConfig['transport'] {
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
  } as LoggerConfig['transport'];
}

function resolveTransportTemplate(
  transport: LoggerConfig['transport'],
  loggerName: string,
): LoggerConfig['transport'] {
  if (!isRecord(transport) || !isRecord(transport.options)) {
    return transport;
  }

  const options = replaceLoggerTemplate(transport.options, loggerName);
  if (options === transport.options) {
    return transport;
  }

  return {
    ...transport,
    options,
  } as LoggerConfig['transport'];
}

function replaceLoggerTemplate(
  options: Record<string, unknown>,
  loggerName: string,
): Record<string, unknown> {
  const templatedKeys = ['destination', 'file'] as const;
  const replacements = Object.fromEntries(
    templatedKeys.flatMap((key) => {
      const value = options[key];
      return typeof value === 'string' && value.includes('{logger}')
        ? [[key, value.replaceAll('{logger}', loggerName)]]
        : [];
    }),
  );

  return Object.keys(replacements).length
    ? { ...options, ...replacements }
    : options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
