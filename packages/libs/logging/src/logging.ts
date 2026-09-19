import { symbols, type DestinationStream } from 'pino';

import { createDefaultLoggingConfig } from './config.js';
import {
  createLogOutput,
  reportLoggingFailure,
  type LoggerFileOptions,
  type LogOutputOptions,
} from './output.js';
import { createLogger } from './logger.js';
import type { Logger, LoggerConfig, LoggingConfig } from './types.js';

interface ClosableDestinationStream extends DestinationStream {
  readonly closed?: boolean;
  readonly destroyed?: boolean;
  end(): void;
  off(event: 'close', listener: () => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
  off(event: 'finish', listener: () => void): this;
  once(event: 'close', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'finish', listener: () => void): this;
}

export class Logging {
  private readonly outputs: LogOutputOptions;
  private readonly defaultLogger: string;
  private readonly defaultConfig: LoggerConfig;
  private readonly loggerConfigs: Readonly<
    Record<string, LoggerConfig & { file?: LoggerFileOptions }>
  >;
  private readonly loggers = new Map<string, Logger>();
  private readonly transportLoggers = new Set<Logger>();
  private readonly transportStreams = new Set<ClosableDestinationStream>();
  private readonly destinations = new Map<
    string,
    ReturnType<typeof createLogOutput>
  >();
  private closePromise: Promise<void> | undefined;

  constructor(config: LoggingConfig = createDefaultLoggingConfig()) {
    const {
      default: defaultLogger = 'system',
      pretty,
      file,
      console: consoleOutput,
      loggers = {},
      ...defaultConfig
    } = config;
    if (config.default !== undefined)
      reportLoggingFailure(
        'logging.default is deprecated; use getLogger(name) explicitly',
      );
    if (pretty !== undefined)
      reportLoggingFailure('logging.pretty is deprecated; use console.pretty');
    this.outputs = {
      file,
      console:
        consoleOutput ??
        (pretty === undefined ? undefined : { enabled: pretty, pretty }),
    };
    this.defaultLogger = defaultLogger;
    this.defaultConfig = defaultConfig;
    this.loggerConfigs = loggers;
  }

  getLogger(name: string = this.defaultLogger): Logger {
    const existing = this.loggers.get(name);
    if (existing) {
      return existing;
    }

    const { file: fileOverride, ...override } = this.loggerConfigs[name] ?? {};
    const config = resolveLoggerConfig(this.defaultConfig, override, name);
    let destination: ReturnType<typeof createLogOutput> | undefined;
    if (config.transport && (this.outputs.file || this.outputs.console))
      reportLoggingFailure(
        'Explicit logging transport owns output; file and console settings are ignored',
      );
    if (!config.transport && (this.outputs.file || this.outputs.console)) {
      const file = {
        ...this.outputs.file,
        ...(fileOverride?.directory === undefined
          ? {}
          : { directory: fileOverride.directory }),
        ...(fileOverride?.name === undefined
          ? {}
          : { name: fileOverride.name }),
        enabled:
          this.outputs.file?.enabled !== false &&
          fileOverride?.enabled !== false,
      };
      const key = JSON.stringify([file, this.outputs.console]);
      destination = this.destinations.get(key);
      if (!destination) {
        destination = createLogOutput({ ...this.outputs, file });
        this.destinations.set(key, destination);
      }
    }
    const logger = createLogger(config, destination).child({ logger: name });
    if (destination) {
      this.transportLoggers.add(logger);
      this.transportStreams.add(destination);
    }
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
      stream.off('finish', handleFinish);
    };
    const handleDone = (): void => {
      cleanup();
      resolve();
    };
    const handleClose = handleDone;
    const handleFinish = handleDone;
    const handleError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    stream.once('close', handleClose);
    stream.once('error', handleError);
    stream.once('finish', handleFinish);
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
