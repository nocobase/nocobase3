import pino, { stdTimeFunctions, type DestinationStream, type StreamEntry } from 'pino';
import pretty from 'pino-pretty';
import type { Logger, LoggerOptions, RedactOptions } from './types.js';

const defaultRedactPaths = [
  'password',
  '*.password',
  'token',
  '*.token',
  'apiKey',
  '*.apiKey',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
];

function resolveRedact(redact: LoggerOptions['redact']): RedactOptions | undefined {
  if (redact === false) return undefined;
  if (!redact) return { paths: defaultRedactPaths, censor: '[REDACTED]' };
  if (Array.isArray(redact)) {
    return { paths: [...new Set([...defaultRedactPaths, ...redact])], censor: '[REDACTED]' };
  }
  return {
    ...redact,
    paths: [...new Set([...defaultRedactPaths, ...redact.paths])],
    censor: redact.censor ?? '[REDACTED]',
  };
}

function createConsoleStream(options: LoggerOptions): DestinationStream {
  const config = options.console ?? {};
  if ((config.format ?? 'pretty') === 'json') return process.stdout;
  return pretty({
    colorize: config.colorize ?? process.stdout.isTTY,
    singleLine: config.singleLine ?? true,
    translateTime: config.translateTime ?? 'SYS:yyyy-mm-dd HH:MM:ss.l',
  });
}

function createFileStream(options: LoggerOptions): DestinationStream {
  if (!options.file?.path) {
    throw new Error('logger.file.path is required when file output is enabled.');
  }
  return pino.destination({
    dest: options.file.path,
    mkdir: options.file.mkdir ?? true,
    sync: options.file.sync ?? false,
  });
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const outputs = [...new Set(options.outputs ?? ['console'])];
  if (!outputs.length) throw new Error('At least one logger output is required.');

  const streams: StreamEntry[] = outputs.map((output) => ({
    stream: output === 'console' ? createConsoleStream(options) : createFileStream(options),
  }));
  const redact = resolveRedact(options.redact);
  const loggerOptions: pino.LoggerOptions = {
    level: options.level ?? 'info',
    name: options.name,
    base: options.base,
    timestamp: stdTimeFunctions.isoTime,
    ...(redact ? { redact } : {}),
  };

  return pino(
    loggerOptions,
    streams.length === 1 ? streams[0]!.stream : pino.multistream(streams),
  );
}
